import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { profile, refetchProfile, signOut } = useProfile();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dob, setDob] = useState(profile.date_of_birth ?? '');
  const [sex, setSex] = useState(profile.sex ?? '');
  const [loading, setLoading] = useState(false);
  const [rides, setRides] = useState<any[]>([]);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');

  useEffect(() => {
    supabase
      .from('rides')
      .select('id, pickup_label, dropoff_label, fare, ride_type, created_at, status')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setRides(data ?? []));
  }, []);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'Name cannot be empty.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
      date_of_birth: dob.trim() || null,
      sex: sex.trim() || null,
    }).eq('id', profile.id);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    refetchProfile();
    setEditing(false);
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setLoading(true);
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const path = `avatars/${profile.id}.${ext}`;

    const formData = new FormData();
    formData.append('file', { uri: asset.uri, name: `avatar.${ext}`, type: `image/${ext}` } as any);

    const { error: upErr } = await supabase.storage.from('avatars').upload(path, formData, { upsert: true });
    if (upErr) { setLoading(false); Alert.alert('Upload failed', upErr.message); return; }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = urlData.publicUrl;
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
    setAvatarUrl(url);
    refetchProfile();
    setLoading(false);
  };

  const rideTypeLabel = (t: string) =>
    t === 'moto' ? '🏍️ Motorcycle' : t === 'eco' ? '🚕 Standard' : '🚙 Premium';

  const statusColor = (s: string) =>
    s === 'completed' ? '#10b981' : s === 'cancelled' ? '#ef4444' : '#f59e0b';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Home')}>
        <Text style={styles.backBtnText}>← Back to map</Text>
      </TouchableOpacity>

      {/* Avatar + name */}
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {(profile.first_name?.[0] ?? profile.email?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarBadgeText}>📷</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.profileName}>{profile.first_name} {profile.last_name}</Text>
        <Text style={styles.profileEmail}>{profile.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{profile.role.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      {/* Edit / View section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Personal Info</Text>
          <TouchableOpacity onPress={() => editing ? handleSave() : setEditing(true)}>
            {loading ? (
              <ActivityIndicator size="small" color="#030712" />
            ) : (
              <Text style={styles.editBtn}>{editing ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {editing ? (
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>FIRST NAME</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>LAST NAME</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>PHONE</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
            <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>GENDER</Text>
            <View style={styles.genderRow}>
              {['Male', 'Female', 'Other'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, sex === g && styles.genderBtnActive]}
                  onPress={() => setSex(g)}
                >
                  <Text style={[styles.genderBtnText, sex === g && styles.genderBtnTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.infoGroup}>
            {[
              ['Full Name', `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—'],
              ['Email', profile.email],
              ['Phone', profile.phone ?? '—'],
              ['Date of Birth', profile.date_of_birth ?? '—'],
              ['Gender', profile.sex ?? '—'],
            ].map(([label, val]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoVal}>{val}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rides.filter(r => r.status === 'completed').length}</Text>
          <Text style={styles.statLabel}>Rides</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ₱{rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare ?? 0), 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rides.filter(r => r.status === 'cancelled').length}</Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
      </View>

      {/* Ride history */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ride History</Text>
        {rides.length === 0 ? (
          <Text style={styles.emptyText}>No rides yet.</Text>
        ) : (
          rides.map((ride) => (
            <View key={ride.id} style={styles.rideItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rideType}>{rideTypeLabel(ride.ride_type)}</Text>
                <Text style={styles.rideRoute} numberOfLines={1}>
                  → {ride.dropoff_label}
                </Text>
                <Text style={styles.rideDate}>
                  {new Date(ride.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.rideFare}>₱{ride.fare}</Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor(ride.status) }]} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20 },

  profileHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 28 },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 99 },
  avatarFallback: { width: 80, height: 80, borderRadius: 99, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#374151' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 99, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  avatarBadgeText: { fontSize: 12 },
  profileName: { fontSize: 22, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  profileEmail: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  roleBadge: { marginTop: 8, backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: '#6b7280', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#030712' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#030712' },
  editBtn: { fontSize: 13, fontWeight: '700', color: '#10b981' },

  formGroup: { gap: 4 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#030712', borderWidth: 1, borderColor: '#f3f4f6' },
  cancelBtn: { marginTop: 12, alignItems: 'center', padding: 12 },
  cancelBtnText: { fontSize: 13, color: '#9ca3af' },
  genderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  genderBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#f9fafb', alignItems: 'center' },
  genderBtnActive: { backgroundColor: '#030712', borderColor: '#030712' },
  genderBtnText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  genderBtnTextActive: { color: '#fff' },

  infoGroup: { gap: 0 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  infoLabel: { fontSize: 13, color: '#9ca3af' },
  infoVal: { fontSize: 13, fontWeight: '600', color: '#030712', maxWidth: '60%', textAlign: 'right' },

  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  rideItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rideType: { fontSize: 13, fontWeight: '600', color: '#030712' },
  rideRoute: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rideDate: { fontSize: 11, color: '#d1d5db', marginTop: 2 },
  rideFare: { fontSize: 15, fontWeight: '700', color: '#030712' },
  statusDot: { width: 8, height: 8, borderRadius: 99 },

  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#10b981' },
  signOutBtn: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
});
