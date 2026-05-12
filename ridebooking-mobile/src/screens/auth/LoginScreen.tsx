import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('auth');
      console.log('[AUTH] redirectTo (add this exact URL to Supabase allowed list):', redirectTo);

      if (Platform.OS === 'web') {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
      } else {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) throw error ?? new Error('No OAuth URL');
        console.log('[AUTH] oauth url:', data.url);

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          await supabase.auth.exchangeCodeForSession(result.url);
        }
      }
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>B</Text>
          </View>
          <Text style={styles.appName}>BiyaHero</Text>
          <Text style={styles.tagline}>Your ride, Your Hero!</Text>
        </View>

        {/* Google Button */}
        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.btnDisabled]}
          onPress={signInWithGoogle}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <>
              <View style={styles.googleIconBox}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Email/password fallback */}
        <TouchableOpacity onPress={() => setShowEmail(v => !v)} style={styles.emailToggle}>
          <Text style={styles.emailToggleText}>
            {showEmail ? 'Hide' : 'Sign in with Email'}
          </Text>
        </TouchableOpacity>

        {showEmail && (
          <View style={styles.emailForm}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#4b5563"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#4b5563"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.emailBtn, loading && styles.btnDisabled]}
              onPress={signInWithEmail}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.emailBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text style={styles.termsLink}>Terms & Conditions</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 300,
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: { alignItems: 'center', marginBottom: 56 },
  logoBox: {
    width: 80, height: 80,
    backgroundColor: '#10b981',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#10b981',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  logoText: { fontSize: 40, fontWeight: '800', color: '#fff' },
  appName: { fontSize: 52, fontWeight: '700', color: '#fff', letterSpacing: -2, lineHeight: 56 },
  tagline: { fontSize: 13, color: '#4b5563', fontWeight: '500', marginTop: 6 },

  googleBtn: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  btnDisabled: { opacity: 0.5 },
  googleIconBox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  googleG: { fontSize: 16, fontWeight: '700', color: '#ea4335' },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#030712' },

  emailToggle: { marginTop: 16, padding: 8 },
  emailToggleText: { fontSize: 13, color: '#6b7280', textDecorationLine: 'underline' },

  emailForm: { width: '100%', gap: 10, marginTop: 8 },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  emailBtn: {
    width: '100%',
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emailBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  terms: { fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 24, lineHeight: 18 },
  termsLink: { color: '#10b981', fontWeight: '600' },
});
