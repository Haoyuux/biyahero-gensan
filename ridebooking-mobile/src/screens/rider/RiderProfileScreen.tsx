import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';

export default function RiderProfileScreen() {
  const { profile, refetchProfile, signOut } = useProfile();

  // Personal info
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dob, setDob] = useState(profile.birthday ?? '');
  const [sex, setSex] = useState(profile.sex ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  // Vehicle info
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [vehicleMake, setVehicleMake] = useState(profile.vehicle_make ?? '');
  const [vehicleModel, setVehicleModel] = useState(profile.vehicle_model ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(profile.vehicle_plate ?? '');
  const [vehicleColor, setVehicleColor] = useState(profile.vehicle_color ?? '');
  const [vehicleType, setVehicleType] = useState(profile.vehicle_type ?? '');
  const [vehicleImageUrl, setVehicleImageUrl] = useState(profile.vehicle_image_url ?? '');
  const [loadingVehicle, setLoadingVehicle] = useState(false);

  // Documents
  const [orUrl, setOrUrl] = useState(profile.or_url ?? '');
  const [crUrl, setCrUrl] = useState(profile.cr_url ?? '');
  const [licenseUrl, setLicenseUrl] = useState(profile.license_url ?? '');
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ label: string; url: string } | null>(null);

  // Stats + history
  const [rides, setRides] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from('rides')
      .select('id, pickup_label, dropoff_label, fare, ride_type, created_at, status, rating')
      .eq('rider_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setRides(data ?? []));
  }, []);

  const handleSavePersonal = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'Name cannot be empty.');
      return;
    }
    setLoadingPersonal(true);
    const { error } = await supabase.from('profiles').update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
      birthday: dob.trim() || null,
      sex: sex.trim() || null,
    }).eq('id', profile.id);
    setLoadingPersonal(false);
    if (error) { Alert.alert('Error', error.message); return; }
    refetchProfile();
    setEditingPersonal(false);
  };

  const handleSaveVehicle = async () => {
    setLoadingVehicle(true);
    const { error } = await supabase.from('profiles').update({
      vehicle_make: vehicleMake.trim() || null,
      vehicle_model: vehicleModel.trim() || null,
      vehicle_plate: vehiclePlate.trim().toUpperCase() || null,
      vehicle_color: vehicleColor.trim() || null,
      vehicle_type: vehicleType.trim() || null,
    }).eq('id', profile.id);
    setLoadingVehicle(false);
    if (error) { Alert.alert('Error', error.message); return; }
    refetchProfile();
    setEditingVehicle(false);
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setLoadingPersonal(true);
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const path = `avatars/${profile.id}.${ext}`;
    const formData = new FormData();
    formData.append('file', { uri: asset.uri, name: `avatar.${ext}`, type: `image/${ext}` } as any);
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, formData, { upsert: true });
    if (upErr) { setLoadingPersonal(false); Alert.alert('Upload failed', upErr.message); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id);
    setAvatarUrl(urlData.publicUrl);
    refetchProfile();
    setLoadingPersonal(false);
  };

  const pickVehiclePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setLoadingVehicle(true);
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const path = `vehicles/${profile.id}.${ext}`;
    const formData = new FormData();
    formData.append('file', { uri: asset.uri, name: `vehicle.${ext}`, type: `image/${ext}` } as any);
    const { error: upErr } = await supabase.storage.from('vehicles').upload(path, formData, { upsert: true });
    if (upErr) { setLoadingVehicle(false); Alert.alert('Upload failed', upErr.message); return; }
    const { data: urlData } = supabase.storage.from('vehicles').getPublicUrl(path);
    await supabase.from('profiles').update({ vehicle_image_url: urlData.publicUrl }).eq('id', profile.id);
    setVehicleImageUrl(urlData.publicUrl);
    refetchProfile();
    setLoadingVehicle(false);
  };

  const pickDocument = async (docType: 'or' | 'cr' | 'license') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    setLoadingDoc(docType);
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const path = `documents/${profile.id}/${docType}.${ext}`;
    const formData = new FormData();
    formData.append('file', { uri: asset.uri, name: `${docType}.${ext}`, type: `image/${ext}` } as any);
    const { error: upErr } = await supabase.storage.from('documents').upload(path, formData, { upsert: true });
    if (upErr) { setLoadingDoc(null); Alert.alert('Upload failed', upErr.message); return; }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
    const url = urlData.publicUrl;
    const field = docType === 'or' ? 'or_url' : docType === 'cr' ? 'cr_url' : 'license_url';
    await supabase.from('profiles').update({ [field]: url }).eq('id', profile.id);
    if (docType === 'or') setOrUrl(url);
    if (docType === 'cr') setCrUrl(url);
    if (docType === 'license') setLicenseUrl(url);
    refetchProfile();
    setLoadingDoc(null);
  };

  const completed = rides.filter(r => r.status === 'completed');
  const totalEarnings = completed.reduce((s, r) => s + (r.fare ?? 0), 0);
  const ratedRides = completed.filter(r => r.rating != null);
  const avgRating = ratedRides.length > 0
    ? ratedRides.reduce((s, r) => s + r.rating, 0) / ratedRides.length
    : null;

  const statusColor = (s: string) =>
    s === 'completed' ? '#10b981' : s === 'cancelled' ? '#ef4444' : '#f59e0b';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
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

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{completed.length}</Text>
          <Text style={styles.statLabel}>Rides</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>₱{totalEarnings.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Earned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {avgRating != null ? `${avgRating.toFixed(1)} ★` : '—'}
          </Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      {/* Personal info */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Personal Info</Text>
          <TouchableOpacity onPress={() => editingPersonal ? handleSavePersonal() : setEditingPersonal(true)}>
            {loadingPersonal ? (
              <ActivityIndicator size="small" color="#030712" />
            ) : (
              <Text style={styles.editBtn}>{editingPersonal ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>
        {editingPersonal ? (
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
                <TouchableOpacity key={g} style={[styles.genderBtn, sex === g && styles.genderBtnActive]} onPress={() => setSex(g)}>
                  <Text style={[styles.genderBtnText, sex === g && styles.genderBtnTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditingPersonal(false)}>
              <Text style={styles.cancelEditText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.infoGroup}>
            {[
              ['Full Name', `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—'],
              ['Email', profile.email],
              ['Phone', profile.phone ?? '—'],
              ['Date of Birth', profile.birthday ?? '—'],
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

      {/* Vehicle info */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Vehicle Info</Text>
          <TouchableOpacity onPress={() => editingVehicle ? handleSaveVehicle() : setEditingVehicle(true)}>
            {loadingVehicle ? (
              <ActivityIndicator size="small" color="#030712" />
            ) : (
              <Text style={styles.editBtn}>{editingVehicle ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {vehicleImageUrl ? (
          <TouchableOpacity onPress={pickVehiclePhoto} style={styles.vehiclePhotoWrap}>
            <Image source={{ uri: vehicleImageUrl }} style={styles.vehiclePhoto} resizeMode="cover" />
            <View style={styles.vehiclePhotoBadge}><Text style={styles.vehiclePhotoBadgeText}>📷 Change</Text></View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.vehiclePhotoPlaceholder} onPress={pickVehiclePhoto}>
            <Text style={styles.vehiclePhotoIcon}>🏍️</Text>
            <Text style={styles.vehiclePhotoHint}>Tap to add vehicle photo</Text>
          </TouchableOpacity>
        )}

        {editingVehicle ? (
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>MAKE (e.g. Honda)</Text>
            <TextInput style={styles.input} value={vehicleMake} onChangeText={setVehicleMake} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>MODEL (e.g. Click 125i)</Text>
            <TextInput style={styles.input} value={vehicleModel} onChangeText={setVehicleModel} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>PLATE NUMBER</Text>
            <TextInput style={styles.input} value={vehiclePlate} onChangeText={setVehiclePlate} autoCapitalize="characters" placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>COLOR</Text>
            <TextInput style={styles.input} value={vehicleColor} onChangeText={setVehicleColor} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>TYPE</Text>
            <View style={styles.typeRow}>
              {['Motorcycle', 'Car', 'Van'].map(t => (
                <TouchableOpacity key={t} style={[styles.genderBtn, vehicleType === t && styles.genderBtnActive]} onPress={() => setVehicleType(t)}>
                  <Text style={[styles.genderBtnText, vehicleType === t && styles.genderBtnTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditingVehicle(false)}>
              <Text style={styles.cancelEditText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.infoGroup}>
            {[
              ['Make', profile.vehicle_make ?? '—'],
              ['Model', profile.vehicle_model ?? '—'],
              ['Plate', profile.vehicle_plate ?? '—'],
              ['Color', profile.vehicle_color ?? '—'],
              ['Type', profile.vehicle_type ?? '—'],
            ].map(([label, val]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={[styles.infoVal, label === 'Plate' && { fontFamily: 'monospace', letterSpacing: 2 }]}>{val}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Documents */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Documents</Text>
        <Text style={styles.docHint}>Upload clear photos of your documents for verification.</Text>

        {([
          { key: 'or' as const, label: "Official Receipt (OR)", url: orUrl },
          { key: 'cr' as const, label: "Certificate of Registration (CR)", url: crUrl },
          { key: 'license' as const, label: "Driver's License", url: licenseUrl },
        ]).map(doc => (
          <View key={doc.key} style={styles.docRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{doc.label}</Text>
              <Text style={[styles.docStatus, doc.url ? styles.docUploaded : styles.docMissing]}>
                {doc.url ? '✓ Uploaded' : 'Not uploaded'}
              </Text>
            </View>
            <View style={styles.docActions}>
              {doc.url ? (
                <TouchableOpacity style={styles.docViewBtn} onPress={() => setPreviewDoc({ label: doc.label, url: doc.url })}>
                  <Text style={styles.docViewText}>View</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.docUploadBtn}
                onPress={() => pickDocument(doc.key)}
                disabled={loadingDoc === doc.key}
              >
                {loadingDoc === doc.key
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.docUploadText}>{doc.url ? 'Replace' : 'Upload'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Document preview modal */}
      <Modal visible={!!previewDoc} transparent animationType="fade" onRequestClose={() => setPreviewDoc(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewDoc(null)}>
            <Text style={styles.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.previewLabel}>{previewDoc?.label}</Text>
          {previewDoc?.url ? (
            <Image source={{ uri: previewDoc.url }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {/* Ride history */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ride History</Text>
        {rides.length === 0 ? (
          <Text style={styles.emptyText}>No rides yet.</Text>
        ) : (
          rides.map((ride) => (
            <View key={ride.id} style={styles.rideItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rideRoute} numberOfLines={1}>→ {ride.dropoff_label}</Text>
                <Text style={styles.rideDate}>
                  {new Date(ride.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                {ride.rating != null && (
                  <Text style={styles.rideRating}>{'★'.repeat(ride.rating)}{'☆'.repeat(5 - ride.rating)}</Text>
                )}
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

  profileHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 24 },
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
  statValue: { fontSize: 18, fontWeight: '700', color: '#030712' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#030712' },
  editBtn: { fontSize: 13, fontWeight: '700', color: '#10b981' },

  vehiclePhotoWrap: { borderRadius: 12, overflow: 'hidden', marginBottom: 14, position: 'relative' },
  vehiclePhoto: { width: '100%', height: 140, borderRadius: 12 },
  vehiclePhotoBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  vehiclePhotoBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  vehiclePhotoPlaceholder: { height: 100, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  vehiclePhotoIcon: { fontSize: 28 },
  vehiclePhotoHint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },

  formGroup: { gap: 4 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#030712', borderWidth: 1, borderColor: '#f3f4f6' },
  cancelEditBtn: { marginTop: 12, alignItems: 'center', padding: 12 },
  cancelEditText: { fontSize: 13, color: '#9ca3af' },
  genderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
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
  rideRoute: { fontSize: 13, fontWeight: '600', color: '#030712' },
  rideDate: { fontSize: 11, color: '#d1d5db', marginTop: 2 },
  rideRating: { fontSize: 11, color: '#f59e0b', marginTop: 2 },
  rideFare: { fontSize: 15, fontWeight: '700', color: '#030712' },
  statusDot: { width: 8, height: 8, borderRadius: 99 },

  signOutBtn: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  docHint: { fontSize: 12, color: '#9ca3af', marginBottom: 14, marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  docLabel: { fontSize: 13, fontWeight: '600', color: '#030712' },
  docStatus: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  docUploaded: { color: '#10b981' },
  docMissing: { color: '#d1d5db' },
  docActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  docViewBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  docViewText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  docUploadBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: '#030712', minWidth: 70, alignItems: 'center' },
  docUploadText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  previewClose: { position: 'absolute', top: 52, right: 20, padding: 10 },
  previewCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  previewImage: { width: '100%', height: 420, borderRadius: 12 },
});
