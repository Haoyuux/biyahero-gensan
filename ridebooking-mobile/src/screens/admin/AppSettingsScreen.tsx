import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TextInput, Alert, TouchableOpacity, Switch, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getAppSettings, updateAppSettings, uploadSettingImage, AppSettings } from '../../lib/settingsService';
import { useUpdate } from '../../contexts/UpdateContext';

export default function AppSettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState({
    app_name: '',
    document_title: '',
    app_logo_url: '' as string | null,
    remittance_qr_url: '' as string | null,
    remittance_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const { updateAvailable, isDownloading, isChecking, progress, updateReady, checkForUpdate, downloadUpdate, applyUpdate } = useUpdate();

  const load = useCallback(async () => {
    const s = await getAppSettings();
    if (s) {
      setSettings(s);
      setForm({
        app_name: s.app_name,
        document_title: s.document_title ?? '',
        app_logo_url: s.app_logo_url,
        remittance_qr_url: s.remittance_qr_url,
        remittance_enabled: s.remittance_enabled,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickImage = async (type: 'logo' | 'qr') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    const folder = type === 'logo' ? 'logos' : 'qrs';
    const setter = type === 'logo' ? setUploadingLogo : setUploadingQr;

    setter(true);
    try {
      const url = await uploadSettingImage(uri, folder);
      setForm(f => type === 'logo' ? { ...f, app_logo_url: url } : { ...f, remittance_qr_url: url });
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
    finally { setter(false); }
  };

  const save = async () => {
    if (!form.app_name.trim()) { Alert.alert('Required', 'App name is required.'); return; }
    setSaving(true);
    try {
      const ok = await updateAppSettings({
        app_name: form.app_name.trim(),
        document_title: form.document_title.trim() || null,
        app_logo_url: form.app_logo_url || null,
        remittance_qr_url: form.remittance_qr_url || null,
        remittance_enabled: form.remittance_enabled,
      });
      if (!ok) throw new Error('Update failed');
      Alert.alert('Saved', 'App settings updated successfully.');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.pageTitle}>App Settings</Text>

        <Text style={s.sectionLabel}>APP UPDATE</Text>
        <View style={s.card}>
          {updateReady ? (
            <>
              <View style={s.updateRow}>
                <View style={[s.updateDot, { backgroundColor: '#10b981' }]} />
                <Text style={s.updateTitle}>Update ready to apply</Text>
              </View>
              <Text style={s.updateHint}>Download complete. Tap below to restart and apply.</Text>
              <TouchableOpacity style={s.updateBtn} onPress={applyUpdate}>
                <Text style={s.updateBtnText}>Restart Now</Text>
              </TouchableOpacity>
            </>
          ) : updateAvailable ? (
            <>
              <View style={s.updateRow}>
                <View style={[s.updateDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={s.updateTitle}>New update available</Text>
              </View>
              <Text style={s.updateHint}>A new version of Biyahero is ready to download.</Text>
              {isDownloading ? (
                <View style={{ marginTop: 12 }}>
                  <View style={s.progressHeader}>
                    <Text style={s.updateHint}>Downloading...</Text>
                    <Text style={[s.updateHint, { fontWeight: '700', color: '#030712' }]}>{progress}%</Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${progress}%` as any }]} />
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.updateBtn} onPress={downloadUpdate}>
                  <Text style={s.updateBtnText}>Download Update</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <View style={s.updateRow}>
                <View style={[s.updateDot, { backgroundColor: '#10b981' }]} />
                <Text style={s.updateTitle}>App is up to date</Text>
              </View>
              <TouchableOpacity
                style={[s.checkBtn, isChecking && s.disabled]}
                onPress={checkForUpdate}
                disabled={isChecking}
              >
                <Text style={s.checkBtnText}>{isChecking ? 'Checking...' : 'Check for Updates'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={s.sectionLabel}>APP IDENTITY</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>App Name *</Text>
          <TextInput
            style={s.input}
            value={form.app_name}
            onChangeText={v => setForm(f => ({ ...f, app_name: v }))}
            placeholder="BiyaHero"
            placeholderTextColor="#9ca3af"
          />

          <Text style={s.fieldLabel}>Browser / Document Title</Text>
          <TextInput
            style={s.input}
            value={form.document_title}
            onChangeText={v => setForm(f => ({ ...f, document_title: v }))}
            placeholder="BiyaHero — Ride Booking"
            placeholderTextColor="#9ca3af"
          />
          <Text style={s.inputHint}>Defaults to App Name if blank.</Text>
        </View>

        <Text style={s.sectionLabel}>APP LOGO</Text>
        <View style={s.card}>
          {form.app_logo_url ? (
            <Image source={{ uri: form.app_logo_url }} style={s.logoPreview} resizeMode="contain" />
          ) : (
            <View style={s.logoPlaceholder}><Text style={s.placeholderText}>No logo set</Text></View>
          )}
          <TouchableOpacity
            style={[s.uploadBtn, uploadingLogo && s.disabled]}
            disabled={uploadingLogo}
            onPress={() => pickImage('logo')}
          >
            <Text style={s.uploadBtnText}>{uploadingLogo ? 'Uploading…' : form.app_logo_url ? 'Replace Logo' : 'Upload Logo'}</Text>
          </TouchableOpacity>
          {form.app_logo_url && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setForm(f => ({ ...f, app_logo_url: null }))}>
              <Text style={s.clearBtnText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionLabel}>REMITTANCE SETTINGS</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Remittance Feature Enabled</Text>
              <Text style={s.inputHint}>Show the Remit tab for riders</Text>
            </View>
            <Switch
              value={form.remittance_enabled}
              onValueChange={v => setForm(f => ({ ...f, remittance_enabled: v }))}
              trackColor={{ true: '#10b981' }}
            />
          </View>

          <Text style={[s.fieldLabel, { marginTop: 16 }]}>GCash / Payment QR Code</Text>
          <Text style={s.inputHint}>Shown to riders when submitting remittances</Text>
          {form.remittance_qr_url ? (
            <Image source={{ uri: form.remittance_qr_url }} style={s.qrPreview} resizeMode="contain" />
          ) : (
            <View style={s.qrPlaceholder}><Text style={s.placeholderText}>No QR set</Text></View>
          )}
          <TouchableOpacity
            style={[s.uploadBtn, uploadingQr && s.disabled]}
            disabled={uploadingQr}
            onPress={() => pickImage('qr')}
          >
            <Text style={s.uploadBtnText}>{uploadingQr ? 'Uploading…' : form.remittance_qr_url ? 'Replace QR' : 'Upload QR Code'}</Text>
          </TouchableOpacity>
          {form.remittance_qr_url && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setForm(f => ({ ...f, remittance_qr_url: null }))}>
              <Text style={s.clearBtnText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        {settings && (
          <Text style={s.lastUpdated}>Last updated: {new Date(settings.updated_at).toLocaleString()}</Text>
        )}

        <TouchableOpacity style={[s.saveBtn, (saving || uploadingLogo || uploadingQr) && s.disabled]} disabled={saving || uploadingLogo || uploadingQr} onPress={save}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save All Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputHint: { fontSize: 11, color: '#9ca3af', marginTop: -4, marginBottom: 10 },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  logoPreview: { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#f3f4f6', marginBottom: 10 },
  logoPlaceholder: { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  qrPreview: { width: 140, height: 140, borderRadius: 8, backgroundColor: '#f3f4f6', marginBottom: 10, alignSelf: 'center' },
  qrPlaceholder: { width: 140, height: 140, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 10, alignSelf: 'center' },
  placeholderText: { fontSize: 12, color: '#9ca3af' },
  uploadBtn: { backgroundColor: '#030712', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  clearBtn: { alignItems: 'center', paddingVertical: 6 },
  clearBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  lastUpdated: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  saveBtn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
  updateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  updateDot: { width: 10, height: 10, borderRadius: 5 },
  updateTitle: { fontSize: 14, fontWeight: '700', color: '#030712' },
  updateHint: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  updateBtn: { backgroundColor: '#030712', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  updateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  checkBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  checkBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressTrack: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#10b981', borderRadius: 4 },
});
