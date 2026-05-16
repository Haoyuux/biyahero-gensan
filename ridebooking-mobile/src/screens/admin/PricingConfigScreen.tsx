import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity, Switch,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { PricingConfig, TierPricing, DEFAULT_PRICING, loadPricingConfigFromDB } from '../../lib/fareService';

type Tier = 'moto' | 'tricycle' | 'eco' | 'premium';
const TIERS: { id: Tier; label: string; color: string }[] = [
  { id: 'moto', label: 'Moto', color: '#f59e0b' },
  { id: 'tricycle', label: 'Tricycle', color: '#f97316' },
  { id: 'eco', label: 'Eco', color: '#10b981' },
  { id: 'premium', label: 'Premium', color: '#6366f1' },
];

interface TierForm {
  baseFare: string;
  perKmRate: string;
  perMinuteRate: string;
  bookingFee: string;
  bookingFeeType: 'static' | 'per_km';
  maintenanceCostPerKm: string;
  perKmThresholdEnabled: boolean;
  perKmThreshold: string;
  disabled: boolean;
}

function toForm(t: TierPricing): TierForm {
  return {
    baseFare: String(t.baseFare),
    perKmRate: String(t.perKmRate),
    perMinuteRate: String(t.perMinuteRate),
    bookingFee: String(t.bookingFee),
    bookingFeeType: t.bookingFeeType,
    maintenanceCostPerKm: String(t.maintenanceCostPerKm),
    perKmThresholdEnabled: t.perKmThresholdEnabled,
    perKmThreshold: String(t.perKmThreshold),
    disabled: t.disabled,
  };
}

function fromForm(f: TierForm, original: TierPricing): TierPricing {
  return {
    ...original,
    baseFare: parseFloat(f.baseFare) || 0,
    perKmRate: parseFloat(f.perKmRate) || 0,
    perMinuteRate: parseFloat(f.perMinuteRate) || 0,
    bookingFee: parseFloat(f.bookingFee) || 0,
    bookingFeeType: f.bookingFeeType,
    maintenanceCostPerKm: parseFloat(f.maintenanceCostPerKm) || 0,
    perKmThresholdEnabled: f.perKmThresholdEnabled,
    perKmThreshold: parseFloat(f.perKmThreshold) || 0,
    disabled: f.disabled,
  };
}

function calcPreview(f: TierForm, distKm = 5, durationMin = 12): number {
  const base = parseFloat(f.baseFare) || 0;
  const rate = parseFloat(f.perKmRate) || 0;
  const minRate = parseFloat(f.perMinuteRate) || 0;
  const fee = parseFloat(f.bookingFee) || 0;
  const threshold = f.perKmThresholdEnabled ? (parseFloat(f.perKmThreshold) || 0) : 0;
  const billableKm = Math.max(0, distKm - threshold);
  const bookingFee = f.bookingFeeType === 'per_km' ? distKm * fee : fee;
  return Math.round(base + billableKm * rate + durationMin * minRate + bookingFee);
}

export default function PricingConfigScreen() {
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [forms, setForms] = useState<Record<Tier, TierForm>>({
    moto: toForm(DEFAULT_PRICING.moto),
    tricycle: toForm(DEFAULT_PRICING.tricycle),
    eco: toForm(DEFAULT_PRICING.eco),
    premium: toForm(DEFAULT_PRICING.premium),
  });
  const [teamDiscount, setTeamDiscount] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const cfg = await loadPricingConfigFromDB(supabase);
    setConfig(cfg);
    setForms({ moto: toForm(cfg.moto), tricycle: toForm(cfg.tricycle), eco: toForm(cfg.eco), premium: toForm(cfg.premium) });
    setTeamDiscount(String(cfg.teamBookingFeeDiscount ?? 0));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (tier: Tier, field: keyof TierForm, value: string | boolean) => {
    setForms(prev => ({ ...prev, [tier]: { ...prev[tier], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const newConfig: PricingConfig = {
        teamBookingFeeDiscount: parseFloat(teamDiscount) || 0,
        moto: fromForm(forms.moto, config.moto),
        tricycle: fromForm(forms.tricycle, config.tricycle),
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
    Alert.alert('Reset to Defaults', 'Restore all default pricing values?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', onPress: () => {
          setConfig(DEFAULT_PRICING);
          setForms({ moto: toForm(DEFAULT_PRICING.moto), tricycle: toForm(DEFAULT_PRICING.tricycle), eco: toForm(DEFAULT_PRICING.eco), premium: toForm(DEFAULT_PRICING.premium) });
          setTeamDiscount('0');
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
          <TouchableOpacity style={s.resetBtn} onPress={reset}><Text style={s.resetBtnText}>Reset Defaults</Text></TouchableOpacity>
        </View>

        {/* Global setting */}
        <View style={s.globalCard}>
          <Text style={s.globalLabel}>Team Booking Fee Discount (%)</Text>
          <Text style={s.globalSub}>Discount applied to booking fees for active team riders</Text>
          <TextInput
            style={s.globalInput}
            value={teamDiscount}
            onChangeText={setTeamDiscount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {TIERS.map(({ id, label, color }) => (
          <View key={id} style={[s.tierCard, forms[id].disabled && s.tierDisabled]}>
            {/* Tier header with disabled toggle */}
            <View style={[s.tierHeader, { borderLeftColor: color }]}>
              <Text style={[s.tierTitle, { color: forms[id].disabled ? '#9ca3af' : color }]}>{label}</Text>
              <View style={s.disabledRow}>
                <Text style={s.disabledLabel}>Hide from users</Text>
                <Switch
                  value={forms[id].disabled}
                  onValueChange={v => updateField(id, 'disabled', v)}
                  trackColor={{ true: '#ef4444' }}
                />
              </View>
            </View>

            <View style={s.fields}>
              {/* Numeric fields */}
              {([
                { key: 'baseFare', label: 'Base Fare (₱)' },
                { key: 'perKmRate', label: 'Per Km Rate (₱, incl. maintenance)' },
                { key: 'perMinuteRate', label: 'Per Min Rate (₱)' },
                { key: 'maintenanceCostPerKm', label: 'Maintenance Cost /km (₱, internal)' },
              ] as { key: keyof TierForm; label: string }[]).map(field => (
                <View key={field.key} style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={forms[id][field.key] as string}
                    onChangeText={v => updateField(id, field.key, v)}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}

              {/* Booking fee type */}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Booking Fee (₱)</Text>
                <View style={s.feeTypeRow}>
                  <TextInput
                    style={[s.fieldInput, { marginRight: 8 }]}
                    value={forms[id].bookingFee}
                    onChangeText={v => updateField(id, 'bookingFee', v)}
                    keyboardType="decimal-pad"
                  />
                  <View style={s.feeTypeBtns}>
                    {(['static', 'per_km'] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[s.feeTypeBtn, forms[id].bookingFeeType === t && s.feeTypeBtnActive]}
                        onPress={() => updateField(id, 'bookingFeeType', t)}
                      >
                        <Text style={[s.feeTypeBtnText, forms[id].bookingFeeType === t && s.feeTypeBtnTextActive]}>
                          {t === 'static' ? 'Fixed' : '×km'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Net revenue info */}
              <View style={s.netRow}>
                <Text style={s.netLabel}>Net revenue /km</Text>
                <Text style={s.netValue}>
                  ₱{Math.max(0, (parseFloat(forms[id].perKmRate) || 0) - (parseFloat(forms[id].maintenanceCostPerKm) || 0)).toFixed(2)}
                </Text>
              </View>

              {/* Free distance threshold */}
              <View style={s.thresholdHeader}>
                <Text style={s.fieldLabel}>Free Distance Threshold</Text>
                <Switch
                  value={forms[id].perKmThresholdEnabled}
                  onValueChange={v => updateField(id, 'perKmThresholdEnabled', v)}
                  trackColor={{ true: '#10b981' }}
                />
              </View>
              {forms[id].perKmThresholdEnabled && (
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Free km (before per-km charges)</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={forms[id].perKmThreshold}
                    onChangeText={v => updateField(id, 'perKmThreshold', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}
            </View>

            {/* Preview */}
            <View style={s.preview}>
              <Text style={s.previewLabel}>Preview: 5km / 12min ride</Text>
              <Text style={[s.previewFare, { color }]}>₱{calcPreview(forms[id])}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Pricing Config'}</Text>
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
  globalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 16 },
  globalLabel: { fontSize: 13, fontWeight: '700', color: '#030712', marginBottom: 4 },
  globalSub: { fontSize: 11, color: '#9ca3af', marginBottom: 10 },
  globalInput: { backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', width: 100 },
  tierCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  tierDisabled: { opacity: 0.6 },
  tierHeader: { borderLeftWidth: 4, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierTitle: { fontSize: 16, fontWeight: '700' },
  disabledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabledLabel: { fontSize: 11, color: '#9ca3af' },
  fields: { paddingHorizontal: 16, paddingBottom: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  fieldLabel: { fontSize: 12, color: '#6b7280', flex: 1, paddingRight: 8 },
  fieldInput: { backgroundColor: '#f9fafb', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontWeight: '600', color: '#030712', borderWidth: 1, borderColor: '#e5e7eb', width: 72, textAlign: 'right' },
  feeTypeRow: { flexDirection: 'row', alignItems: 'center' },
  feeTypeBtns: { flexDirection: 'row', gap: 4 },
  feeTypeBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f3f4f6' },
  feeTypeBtnActive: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#10b981' },
  feeTypeBtnText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  feeTypeBtnTextActive: { color: '#10b981' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, backgroundColor: '#f9fafb', paddingHorizontal: 4, borderRadius: 6, marginVertical: 4 },
  netLabel: { fontSize: 11, color: '#9ca3af' },
  netValue: { fontSize: 12, fontWeight: '700', color: '#10b981' },
  thresholdHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  preview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 12 },
  previewLabel: { fontSize: 12, color: '#9ca3af' },
  previewFare: { fontSize: 20, fontWeight: '800' },
  saveBtn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
