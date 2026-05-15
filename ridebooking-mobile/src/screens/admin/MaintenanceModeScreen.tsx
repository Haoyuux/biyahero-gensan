import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity, Switch,
} from 'react-native';
import { getMaintenanceSettings, updateMaintenanceSettings, MaintenanceSettings } from '../../lib/maintenanceService';

type Mode = 'off' | 'half' | 'full';

const MODES: { id: Mode; label: string; desc: string; color: string }[] = [
  { id: 'off', label: 'Off', desc: 'Normal operation — all users have full access', color: '#10b981' },
  { id: 'half', label: 'Half', desc: 'Marquee warning shown to all users; riders can still work', color: '#f59e0b' },
  { id: 'full', label: 'Full', desc: 'Complete lockdown — non-admin users see maintenance screen', color: '#ef4444' },
];

interface FormState {
  mode: Mode;
  message: string;
  marquee_message: string;
  immediate: boolean;
  reg_user_disabled: boolean;
  reg_rider_disabled: boolean;
}

export default function MaintenanceModeScreen() {
  const [form, setForm] = useState<FormState>({
    mode: 'off', message: '', marquee_message: '',
    immediate: true, reg_user_disabled: false, reg_rider_disabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await getMaintenanceSettings();
    if (s) {
      setForm({
        mode: s.mode,
        message: s.message ?? '',
        marquee_message: s.marquee_message ?? '',
        immediate: s.immediate,
        reg_user_disabled: s.reg_user_disabled,
        reg_rider_disabled: s.reg_rider_disabled,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const save = async () => {
    if (form.mode !== 'off' && !form.message.trim()) {
      Alert.alert('Required', 'Please enter a maintenance message for users.');
      return;
    }
    if (form.mode === 'half' && !form.marquee_message.trim()) {
      Alert.alert('Required', 'Please enter a marquee message for half mode.');
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<Omit<MaintenanceSettings, 'id' | 'updated_at'>> = {
        mode: form.mode,
        message: form.message.trim() || null,
        marquee_message: form.marquee_message.trim() || null,
        immediate: form.immediate,
        reg_user_disabled: form.reg_user_disabled,
        reg_rider_disabled: form.reg_rider_disabled,
      };
      const ok = await updateMaintenanceSettings(updates);
      if (!ok) throw new Error('Update failed');
      Alert.alert('Saved', `Maintenance mode set to "${form.mode}".`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.pageTitle}>Maintenance Mode</Text>

        {/* Mode selector */}
        <Text style={s.sectionLabel}>MODE</Text>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[s.modeCard, form.mode === m.id && { borderColor: m.color, backgroundColor: m.color + '10' }]}
            onPress={() => update('mode', m.id)}
          >
            <View style={[s.modeIndicator, { backgroundColor: m.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.modeLabel, form.mode === m.id && { color: m.color }]}>{m.label}</Text>
              <Text style={s.modeDesc}>{m.desc}</Text>
            </View>
            <View style={[s.radio, form.mode === m.id && { borderColor: m.color }]}>
              {form.mode === m.id && <View style={[s.radioDot, { backgroundColor: m.color }]} />}
            </View>
          </TouchableOpacity>
        ))}

        {/* Messages */}
        {form.mode !== 'off' && (
          <>
            <Text style={s.sectionLabel}>
              {form.mode === 'full' ? 'MAINTENANCE SCREEN MESSAGE *' : 'MAINTENANCE SCREEN MESSAGE *'}
            </Text>
            <TextInput
              style={s.textArea}
              value={form.message}
              onChangeText={v => update('message', v)}
              placeholder="We're performing scheduled maintenance. We'll be back shortly."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
            />

            {form.mode === 'half' && (
              <>
                <Text style={s.sectionLabel}>MARQUEE BANNER MESSAGE *</Text>
                <TextInput
                  style={s.textArea}
                  value={form.marquee_message}
                  onChangeText={v => update('marquee_message', v)}
                  placeholder="⚠ Limited service. Some features are temporarily unavailable."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                />
              </>
            )}
          </>
        )}

        {/* Activation */}
        <Text style={s.sectionLabel}>ACTIVATION</Text>
        <View style={s.toggleCard}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Apply Immediately</Text>
              <Text style={s.toggleSub}>Activate right now without a schedule</Text>
            </View>
            <Switch value={form.immediate} onValueChange={v => update('immediate', v)} trackColor={{ true: '#10b981' }} />
          </View>
        </View>

        {/* Registration toggles */}
        <Text style={s.sectionLabel}>REGISTRATION CONTROLS</Text>
        <View style={s.toggleCard}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Disable Passenger Registration</Text>
              <Text style={s.toggleSub}>New passenger accounts cannot be created</Text>
            </View>
            <Switch value={form.reg_user_disabled} onValueChange={v => update('reg_user_disabled', v)} trackColor={{ true: '#ef4444' }} />
          </View>
          <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 4, paddingTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Disable Rider Registration</Text>
              <Text style={s.toggleSub}>New rider applications cannot be submitted</Text>
            </View>
            <Switch value={form.reg_rider_disabled} onValueChange={v => update('reg_rider_disabled', v)} trackColor={{ true: '#ef4444' }} />
          </View>
        </View>

        {form.mode === 'full' && (
          <View style={s.warningBox}>
            <Text style={s.warningText}>⚠  Full mode will block ALL non-admin users from accessing the app immediately upon save.</Text>
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Apply Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  modeCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIndicator: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  modeLabel: { fontSize: 15, fontWeight: '700', color: '#030712', marginBottom: 2 },
  modeDesc: { fontSize: 12, color: '#6b7280' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  textArea: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top' },
  toggleCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#030712', marginBottom: 2 },
  toggleSub: { fontSize: 11, color: '#9ca3af' },
  warningBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#fecaca' },
  warningText: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
