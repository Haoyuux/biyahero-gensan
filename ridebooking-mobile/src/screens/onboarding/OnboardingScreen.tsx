import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';

export default function OnboardingScreen() {
  const { profile, refetchProfile } = useProfile();
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dob, setDob] = useState(profile.date_of_birth ?? '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'Enter your first and last name.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
      date_of_birth: dob.trim() || null,
      profile_completed: true,
      onboarded: true,
    }).eq('id', profile.id);

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    refetchProfile();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>B</Text>
          </View>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>We need a few details before you start.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.fieldLabel}>FIRST NAME</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Juan"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.fieldLabel}>LAST NAME</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Dela Cruz"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="09XXXXXXXXX"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
          <TextInput
            style={styles.input}
            value={dob}
            onChangeText={setDob}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Get Started →</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { flexGrow: 1, padding: 28, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#4b5563', textAlign: 'center' },
  form: { gap: 4, marginBottom: 28 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: '#4b5563', letterSpacing: 1.5, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#111', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#222',
  },
  btn: { backgroundColor: '#10b981', borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
