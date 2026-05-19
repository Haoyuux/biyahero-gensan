import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Linking, Platform, Modal, TouchableOpacity, Alert } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { UpdateProvider, useUpdate } from './src/contexts/UpdateContext';

// Web relay: when Supabase redirects to the Metro dev server via IP (http://10.x.x.x:8082/auth?code=xxx),
// relay to the native app via exp:// deep link.
// Only triggers for non-localhost access (i.e. phone browser, not desktop web browser).
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const href = window.location.href;
  const host = window.location.host;
  const isPhoneAccess = !host.includes('localhost') && !host.includes('127.0.0.1');
  if (isPhoneAccess && href.includes('/auth') && (href.includes('?code=') || href.includes('access_token='))) {
    const nativeUrl = `exp://${host}/--${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(nativeUrl);
  }
}
import { getAppSettings, AppSettings } from './src/lib/settingsService';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from './src/hooks/useAuth';
import { AuthProvider } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/auth/LoginScreen';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import UserNavigator from './src/navigation/UserNavigator';
import RiderNavigator from './src/navigation/RiderNavigator';
import AdminNavigator from './src/navigation/AdminNavigator';
import { supabase } from './src/lib/supabase';

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  const { session, profile, loading, signOut, refetchProfile } = useAuth();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);



  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (url.includes('error=')) return;
      if (url.includes('access_token=')) {
        // Implicit flow — tokens in fragment
        const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
        const params = new URLSearchParams(fragment);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      } else if (/[?&]code=[^&]+/.test(url)) {
        // PKCE flow — exchange code
        await supabase.auth.exchangeCodeForSession(url);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    getAppSettings().then(s => { if (s) setAppSettings(s); });
  }, []);

  if (appSettings?.maintenance_mode === 'full') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef3c7', padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 24 }}>🔧</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#030712', textAlign: 'center', marginBottom: 12 }}>
          Under Maintenance
        </Text>
        <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
          {appSettings.maintenance_message ?? "We'll be back shortly."}
        </Text>
      </View>
    );
  }

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!session || !profile) {
    return <LoginScreen />;
  }

  if (!profile.profile_completed || !profile.onboarded) {
    return (
      <AuthProvider value={{ profile, signOut, refetchProfile }}>
        <OnboardingScreen />
      </AuthProvider>
    );
  }

  const isRider = profile.role === 'rider' || profile.role === 'team_leader';
  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';

  return (
    <UpdateProvider>
      <AuthProvider value={{ profile, signOut, refetchProfile }}>
        <NavigationContainer>
          {isAdmin
            ? <AdminNavigator />
            : isRider
            ? <RiderNavigator appSettings={appSettings} />
            : <UserNavigator />}
        </NavigationContainer>
        <GlobalUpdateModal />
      </AuthProvider>
    </UpdateProvider>
  );
}

function GlobalUpdateModal() {
  const { updateAvailable, updateReady, isDownloading, progress, downloadUpdate, applyUpdate } = useUpdate();
  const [dismissed, setDismissed] = useState(false);
  const visible = !dismissed && (updateAvailable || updateReady);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!isDownloading) setDismissed(true); }}>
      <View style={um.overlay}>
        <View style={um.card}>
          {!isDownloading && (
            <TouchableOpacity style={um.closeBtn} onPress={() => setDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={um.closeTxt}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={um.emoji}>{updateReady ? '✅' : '🔄'}</Text>
          <Text style={um.title}>{updateReady ? 'Update Ready' : 'New Update Available'}</Text>
          <Text style={um.subtitle}>
            {updateReady
              ? 'Download complete. Restart the app to apply the new version.'
              : 'A new version of Biyahero is ready to install.'}
          </Text>
          {isDownloading ? (
            <View style={{ marginTop: 16 }}>
              <View style={um.progressHeader}>
                <Text style={um.progressLabel}>Downloading...</Text>
                <Text style={um.progressPct}>{progress}%</Text>
              </View>
              <View style={um.track}>
                <View style={[um.fill, { width: `${progress}%` as any }]} />
              </View>
            </View>
          ) : updateReady ? (
            <TouchableOpacity style={um.btn} onPress={applyUpdate}>
              <Text style={um.btnTxt}>Restart Now</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={um.btn} onPress={downloadUpdate}>
              <Text style={um.btnTxt}>Download & Install</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
});

const um = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.4)' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 14, right: 16 },
  closeTxt: { fontSize: 16, color: '#9ca3af', fontWeight: '600' },
  emoji: { fontSize: 36, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 4, lineHeight: 20 },
  btn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 16, alignSelf: 'stretch', alignItems: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 12, color: '#6b7280' },
  progressPct: { fontSize: 12, fontWeight: '700', color: '#030712' },
  track: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden', width: '100%' },
  fill: { height: 8, backgroundColor: '#10b981', borderRadius: 4 },
});
