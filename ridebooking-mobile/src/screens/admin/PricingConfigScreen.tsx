import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { PricingConfig, TierPricing, DEFAULT_PRICING, loadPricingConfigFromDB } from '../../lib/fareService';

type Tier = 'moto' | 'eco' | 'premium';
const TIERS: { id: Tier; label: string; color: string }[] = [
  { id: 'moto', label: 'Moto', color: '#f59e0b' },
  { id: 'eco', label: 'Eco', color: '#10b981' },
  { id: 'premium', label: 'Premium', color: '#6366f1' },
];

type TierForm = Record<keyof Omit<TierPricing, 'bookingFeeType' | 'disabled'>, string>;

function toForm(t: TierPricing): TierForm {
  return {
    baseFare: String(t.baseFare),
    perKmRate: String(t.perKmRate),
    perMinuteRate: String(t.perMinuteRate),
    bookingFee: String(t.bookingFee),
    maintenanceCostPerKm: String(t.maintenanceCostPerKm),
    perKmThresholdEnabled: String(t.perKmThresholdEnabled),
    perKmThreshold: String(t.perKmThreshold),
  };
}

function fromForm(f: TierForm, original: TierPricing): TierPricing {
  return {
    ...original,
    baseFare: parseFloat(f.baseFare) || 0,
    perKmRate: parseFloat(f.perKmRate) || 0,
    perMinuteRate: parseFloat(f.perMinuteRate) || 0,
    bookingFee: parseFloat(f.bookingFee) || 0,
    maintenanceCostPerKm: parseFloat(f.maintenanceCostPerKm) || 0,
    perKmThreshold: parseFloat(f.perKmThreshold) || 0,
  };
}

export default function PricingConfigScreen() {
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [forms, setForms] = useState<Record<Tier, TierForm>>({
    moto: toForm(DEFAULT_PRICING.moto),
    eco: toForm(DEFAULT_PRICING.eco),
    premium: toForm(DEFAULT_PRICING.premium),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const cfg = await loadPricingConfigFromDB(supabase);
    setConfig(cfg);
    setForms({ moto: toForm(cfg.moto), eco: toForm(cfg.eco), premium: toForm(cfg.premium) });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (tier: Tier, field: keyof TierForm, value: string) => {
    setForms(prev => ({ ...prev, [tier]: { ...prev[tier], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const newConfig: PricingConfig = {
        teamBookingFeeDiscount: config.teamBookingFeeDiscount,
        moto: fromForm(forms.moto, config.moto),
        eco: fromForm(forms.eco, config.eco),
        premium: fromForm(forms.premium, config.premium),
      };
      const { error } = await supabase.from('pricing_config').upsert({ id: 1, config: newConfig });
      if (error) throw error;
      setConfig(newConfig);
      Alert.alert('Saved', 'Pricing config updated successfully.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const reset = () => {
    Alert.alert('Reset to Defaults', 'Restore default pricing values?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', onPress: () => {
          setConfig(DEFAULT_PRICING);
          setForms({ moto: toForm(DEFAULT_PRICING.moto), eco: toForm(DEFAULT_PRICING.eco), premium: toForm(DEFAULT_PRICING.premium) });
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.pageTitle}>Pricing Config</Text>
          <TouchableOpacity style={s.resetBtn} onPress={reset}><Text style={s.resetBtnText}>Reset</Text></TouchableOpacity>
        </View>

        {TIERS.map(({ id, label, color }) => (
          <View key={id} style={s.tierCard}>
            <View style={[s.tierHeader, { borderLeftColor: color }]}>
              <Text style={[s.tierTitle, { color }]}>{label}</Text>
            </View>
            <View style={s.fields}>
              {([
                { key: 'baseFare', label: 'Base Fare (₱)' },
                { key: 'perKmRate', label: 'Per Km Rate (₱)' },
                { key: 'perMinuteRate', label: 'Per Min Rate (₱)' },
                { key: 'bookingFee', label: 'Booking Fee (₱)' },
              ] as { key: keyof TierForm; label: string }[]).map(field => (
                <View key={field.key} style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={forms[id][field.key]}
                    onChangeText={v => updateField(id, field.key, v)}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
            <View style={s.preview}>
              <Text style={s.previewLabel}>Preview: 5km / 12min ride</Text>
              <Text style={s.previewFare}>
                ₱{(
                  (parseFloat(forms[id].baseFare) || 0) +
                  (parseFloat(forms[id].perKmRate) || 0) * 5 +
                  (parseFloat(forms[id].perMinuteRate) || 0) * 12 +
                  (parseFloat(forms[id].bookingFee) || 0)
                ).toFixed(2)}
              </Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Pricing'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712' },
  resetBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  resetBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tierCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  tierHeader: { borderLeftWidth: 4, paddingHorizontal: 16, paddingVertical: 12 },
  tierTitle: { fontSize: 15, fontWeight: '700' },
  fields: { paddingHorizontal: 16, paddingBottom: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  fieldLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  fieldInput: { backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontWeight: '600', color: '#030712', borderWidth: 1, borderColor: '#e5e7eb', width: 80, textAlign: 'right' },
  preview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10 },
  previewLabel: { fontSize: 11, color: '#9ca3af' },
  previewFare: { fontSize: 16, fontWeight: '800', color: '#030712' },
  saveBtn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
