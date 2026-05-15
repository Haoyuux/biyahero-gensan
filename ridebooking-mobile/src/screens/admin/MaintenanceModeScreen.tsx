import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getAppSettings } from '../../lib/settingsService';

type Mode = 'off' | 'half' | 'full';

const MODES: { id: Mode; label: string; desc: string; color: string }[] = [
  { id: 'off', label: 'Off', desc: 'Normal operation', color: '#10b981' },
  { id: 'half', label: 'Half', desc: 'Marquee warning shown; riders can still work', color: '#f59e0b' },
  { id: 'full', label: 'Full', desc: 'All non-admin users see maintenance screen', color: '#ef4444' },
];

export default function MaintenanceModeScreen() {
  const [mode, setMode] = useState<Mode>('off');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await getAppSettings();
    if (s) { setMode(s.maintenance_mode); setMessage(s.maintenance_message ?? ''); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (mode !== 'off' && !message.trim()) {
      Alert.alert('Required', 'Please enter a maintenance message shown to users.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ maintenance_mode: mode, maintenance_message: message.trim() || null })
        .eq('id', 1);
      if (error) throw error;
      Alert.alert('Saved', `Maintenance mode set to "${mode}".`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.pageTitle}>Maintenance Mode</Text>

        <Text style={s.sectionLabel}>MODE</Text>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[s.modeCard, mode === m.id && { borderColor: m.color, backgroundColor: m.color + '10' }]}
            onPress={() => setMode(m.id)}
          >
            <View style={[s.modeIndicator, { backgroundColor: m.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.modeLabel, mode === m.id && { color: m.color }]}>{m.label}</Text>
              <Text style={s.modeDesc}>{m.desc}</Text>
            </View>
            <View style={[s.radio, mode === m.id && { borderColor: m.color }]}>
              {mode === m.id && <View style={[s.radioDot, { backgroundColor: m.color }]} />}
            </View>
          </TouchableOpacity>
        ))}

        <Text style={s.sectionLabel}>MESSAGE {mode === 'off' ? '(optional)' : '(required)'}</Text>
        <TextInput
          style={[s.msgInput, mode !== 'off' && s.msgInputRequired]}
          value={message}
          onChangeText={setMessage}
          placeholder={mode === 'half' ? "Limited service. Some features temporarily unavailable." : mode === 'full' ? "We're performing maintenance. Back shortly." : "Optional maintenance message"}
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
        />

        {mode === 'full' && (
          <View style={s.warningBox}>
            <Text style={s.warningText}>⚠ Full mode will block ALL non-admin users from accessing the app immediately.</Text>
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Apply Maintenance Mode'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  modeCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIndicator: { width: 10, height: 10, borderRadius: 5 },
  modeLabel: { fontSize: 15, fontWeight: '700', color: '#030712', marginBottom: 2 },
  modeDesc: { fontSize: 12, color: '#6b7280' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  msgInput: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 100, textAlignVertical: 'top' },
  msgInputRequired: { borderColor: '#f59e0b' },
  warningBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#fecaca' },
  warningText: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
