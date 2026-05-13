import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { getAppSettings, AppSettings } from './src/lib/settingsService';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from './src/hooks/useAuth';
import { AuthProvider } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/auth/LoginScreen';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import UserNavigator from './src/navigation/UserNavigator';
import RiderNavigator from './src/navigation/RiderNavigator';
import { supabase } from './src/lib/supabase';

export default function App() {
  const { session, profile, loading, signOut, refetchProfile } = useAuth();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const hasAuthCode = (url: string) =>
      /[?&]code=[^&]+/.test(url) && !url.includes('error=');

    const handleUrl = async ({ url }: { url: string }) => {
      if (hasAuthCode(url)) {
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

  if (loading) {
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

  return (
    <AuthProvider value={{ profile, signOut, refetchProfile }}>
      <NavigationContainer>
        {isRider ? <RiderNavigator appSettings={appSettings} /> : <UserNavigator />}
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
});
