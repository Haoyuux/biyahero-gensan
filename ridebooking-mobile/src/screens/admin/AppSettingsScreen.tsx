import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity, Switch,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getAppSettings, AppSettings } from '../../lib/settingsService';

export default function AppSettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState({ app_name: '', document_title: '', remittance_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await getAppSettings();
    if (s) {
      setSettings(s);
      setForm({ app_name: s.app_name, document_title: s.document_title ?? '', remittance_enabled: s.remittance_enabled });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ app_name: form.app_name.trim(), document_title: form.document_title.trim() || null, remittance_enabled: form.remittance_enabled })
        .eq('id', 1);
      if (error) throw error;
      Alert.alert('Saved', 'App settings updated.');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.pageTitle}>App Settings</Text>

        <View style={s.card}>
          <Text style={s.fieldLabel}>App Name</Text>
          <TextInput
            style={s.input}
            value={form.app_name}
            onChangeText={v => setForm(f => ({ ...f, app_name: v }))}
            placeholder="BiyaHero"
            placeholderTextColor="#9ca3af"
          />

          <Text style={s.fieldLabel}>Document / Browser Title</Text>
          <TextInput
            style={s.input}
            value={form.document_title}
            onChangeText={v => setForm(f => ({ ...f, document_title: v }))}
            placeholder="BiyaHero — Ride Booking"
            placeholderTextColor="#9ca3af"
          />

          <View style={s.toggleRow}>
            <View>
              <Text style={s.fieldLabel}>Remittance Feature</Text>
              <Text style={s.fieldSub}>Show remittance tab for riders</Text>
            </View>
            <Switch
              value={form.remittance_enabled}
              onValueChange={v => setForm(f => ({ ...f, remittance_enabled: v }))}
              trackColor={{ true: '#10b981' }}
            />
          </View>
        </View>

        {settings && (
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>Last Updated</Text>
            <Text style={s.infoValue}>{new Date(settings.updated_at).toLocaleString()}</Text>
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} disabled={saving} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  fieldSub: { fontSize: 11, color: '#9ca3af', marginTop: -6, marginBottom: 4 },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  infoLabel: { fontSize: 12, color: '#9ca3af' },
  infoValue: { fontSize: 12, fontWeight: '600', color: '#374151' },
  saveBtn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
