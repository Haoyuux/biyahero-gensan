import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Linking } from 'react-native';
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
        {isRider ? <RiderNavigator /> : <UserNavigator />}
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
});
