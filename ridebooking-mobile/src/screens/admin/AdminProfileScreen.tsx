import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image,
} from 'react-native';
import { useProfile } from '../../contexts/AuthContext';

export default function AdminProfileScreen() {
  const { profile, signOut } = useProfile();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.title}>Admin Profile</Text>

        <View style={s.card}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarInitial}>
                {(profile.full_name ?? profile.email)[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={s.name}>{profile.full_name ?? '—'}</Text>
          <Text style={s.email}>{profile.email}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{profile.role.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 24,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  email: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  badge: { backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#059669', letterSpacing: 0.5 },
  signOutBtn: { backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
