import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase, RiderVehicle } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';
import { useUpdate } from '../../contexts/UpdateContext';

const VEHICLE_TYPES = ['Motorcycle', 'Tricycle', 'Car', 'Van'];

const VEHICLE_TYPE_EMOJI: Record<string, string> = {
  Motorcycle: '🏍️',
  Tricycle: '🛺',
  Car: '🚕',
  Van: '🚐',
};

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
};

const EMPTY_VEHICLE_FORM = {
  vehicle_type: '',
  vehicle_make: '',
  vehicle_model: '',
  vehicle_plate: '',
  vehicle_color: '',
  vehicle_image_url: '',
  or_url: '',
  cr_url: '',
};

export default function RiderProfileScreen() {
  const { profile, refetchProfile, signOut } = useProfile();
  const { updateAvailable, updateReady, isDownloading, isChecking, progress, checkForUpdate, downloadUpdate, applyUpdate } = useUpdate();

  // Personal info
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dob, setDob] = useState(profile.birthday ?? '');
  const [sex, setSex] = useState(profile.sex ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  // Documents — OR/CR are now per-vehicle; license stays on profile
  const [licenseUrl, setLicenseUrl] = useState(profile.license_url ?? '');
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ label: string; url: string } | null>(null);

  // Additional vehicles (vehicle_number >= 2 in vehicles table)
  const [vehicles, setVehicles] = useState<RiderVehicle[]>([]);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [loadingVehicleForm, setLoadingVehicleForm] = useState(false);
  const [loadingVehicleDoc, setLoadingVehicleDoc] = useState<string | null>(null);
  const [previewVehicleDoc, setPreviewVehicleDoc] = useState<{ label: string; url: string } | null>(null);
  const [viewingVehicle, setViewingVehicle] = useState<RiderVehicle | null>(null);

  // Stats + history
  const [rides, setRides] = useState<any[]>([]);
  const [errandHistory, setErrandHistory] = useState<any[]>([]);

  const loadVehicles = useCallback(async () => {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('rider_id', profile.id)
      .order('vehicle_number', { ascending: true });
    setVehicles((data ?? []) as RiderVehicle[]);
  }, [profile.id]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  useEffect(() => {
    supabase
      .from('rides')
      .select('id, pickup_label, dropoff_label, fare, ride_type, created_at, status, rating')
      .eq('rider_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setRides(data ?? []));
    supabase
      .from('errands')
      .select('id, errand_type, pickup_label, dropoff_label, description, fare, status, created_at, completed_at, user_name, recipient_name')
      .eq('rider_id', profile.id)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setErrandHistory(data ?? []));
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


  const uploadToStorage = async (uri: string, mimeType: string, bucket: string, path: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType, upsert: true });
  };

  const resolveExt = (asset: { mimeType?: string; uri: string }) => {
    if (asset.mimeType) return asset.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const fromUri = asset.uri.split('.').pop() ?? '';
    return /^(jpg|jpeg|png|gif|webp|heic)$/i.test(fromUri) ? fromUri.toLowerCase() : 'jpg';
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
    try {
      const asset = result.assets[0];
      const ext = resolveExt(asset);
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const path = `avatars/${profile.id}.${ext}`;
      const { error: upErr } = await uploadToStorage(asset.uri, mimeType, 'avatars', path);
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id);
      setAvatarUrl(urlData.publicUrl);
      refetchProfile();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setLoadingPersonal(false);
    }
  };

  const pickDocument = async (docType: 'license') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    setLoadingDoc(docType);
    try {
      const asset = result.assets[0];
      const ext = resolveExt(asset);
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const path = `documents/${profile.id}/${docType}.${ext}`;
      const { error: upErr } = await uploadToStorage(asset.uri, mimeType, 'documents', path);
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      const url = urlData.publicUrl;
      await supabase.from('profiles').update({ license_url: url }).eq('id', profile.id);
      setLicenseUrl(url);
      refetchProfile();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleSaveVehicleForm = async () => {
    if (!vehicleForm.vehicle_type) { Alert.alert('Required', 'Select a vehicle type.'); return; }
    setLoadingVehicleForm(true);
    try {
      const vehicleData = {
        vehicle_type: vehicleForm.vehicle_type,
        vehicle_make: vehicleForm.vehicle_make.trim() || null,
        vehicle_model: vehicleForm.vehicle_model.trim() || null,
        vehicle_plate: vehicleForm.vehicle_plate.trim().toUpperCase() || null,
        vehicle_color: vehicleForm.vehicle_color.trim() || null,
        vehicle_image_url: vehicleForm.vehicle_image_url || null,
        or_url: vehicleForm.or_url || null,
        cr_url: vehicleForm.cr_url || null,
        status: 'pending' as const,
      };

      let savedVehicleNumber = 1;
      if (editingVehicleId) {
        const { error } = await supabase.from('vehicles').update(vehicleData).eq('id', editingVehicleId);
        if (error) throw error;
        savedVehicleNumber = vehicles.find(v => v.id === editingVehicleId)?.vehicle_number ?? 1;
      } else {
        savedVehicleNumber = vehicles.length > 0
          ? Math.max(...vehicles.map(v => v.vehicle_number)) + 1
          : 1;
        const { error } = await supabase.from('vehicles').insert({
          rider_id: profile.id,
          vehicle_number: savedVehicleNumber,
          ...vehicleData,
        });
        if (error) throw error;
      }

      // Keep profiles.vehicle_* in sync for 1st vehicle (backward compat with admin screens)
      if (savedVehicleNumber === 1) {
        await supabase.from('profiles').update({
          vehicle_type: vehicleData.vehicle_type,
          vehicle_make: vehicleData.vehicle_make,
          vehicle_model: vehicleData.vehicle_model,
          vehicle_plate: vehicleData.vehicle_plate,
          vehicle_color: vehicleData.vehicle_color,
          vehicle_image_url: vehicleData.vehicle_image_url,
          or_url: vehicleData.or_url,
          cr_url: vehicleData.cr_url,
        }).eq('id', profile.id);
        refetchProfile();
      }

      setShowVehicleModal(false);
      setEditingVehicleId(null);
      setVehicleForm(EMPTY_VEHICLE_FORM);
      await loadVehicles();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoadingVehicleForm(false);
    }
  };

  const openAddVehicle = () => {
    setEditingVehicleId(null);
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setShowVehicleModal(true);
  };

  const openEditVehicle = (v: RiderVehicle) => {
    setEditingVehicleId(v.id);
    setVehicleForm({
      vehicle_type: v.vehicle_type,
      vehicle_make: v.vehicle_make ?? '',
      vehicle_model: v.vehicle_model ?? '',
      vehicle_plate: v.vehicle_plate ?? '',
      vehicle_color: v.vehicle_color ?? '',
      vehicle_image_url: v.vehicle_image_url ?? '',
      or_url: v.or_url ?? '',
      cr_url: v.cr_url ?? '',
    });
    setShowVehicleModal(true);
  };

  const pickVehicleFormImage = async (field: 'vehicle_image_url' | 'or_url' | 'cr_url') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: field === 'vehicle_image_url',
      aspect: field === 'vehicle_image_url' ? [4, 3] : undefined,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setLoadingVehicleDoc(field);
    try {
      const asset = result.assets[0];
      const ext = resolveExt(asset);
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const subfolder = field === 'vehicle_image_url' ? 'photo' : field === 'or_url' ? 'or' : 'cr';
      const vehicleSuffix = editingVehicleId ?? `new_${Date.now()}`;
      const path = `vehicles/${profile.id}/${vehicleSuffix}/${subfolder}.${ext}`;
      const { error: upErr } = await uploadToStorage(asset.uri, mimeType, 'documents', path);
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      setVehicleForm(f => ({ ...f, [field]: urlData.publicUrl }));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setLoadingVehicleDoc(null);
    }
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

      {/* My Vehicles */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>My Vehicles</Text>
          {vehicles.length > 0 && (
            <TouchableOpacity style={styles.addVehicleBtn} onPress={openAddVehicle}>
              <Text style={styles.addVehicleBtnText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {vehicles.length === 0 ? (
          <TouchableOpacity style={styles.registerVehicleBtn} onPress={openAddVehicle}>
            <Text style={styles.registerVehicleBtnText}>+ Register Your Vehicle</Text>
          </TouchableOpacity>
        ) : (
          vehicles.map(v => (
            <View key={v.id} style={styles.vehicleRow}>
              <View style={styles.vehicleRowLeft}>
                <View style={styles.vehicleNumBadge}>
                  <Text style={styles.vehicleNumText}>{ORDINAL[v.vehicle_number] ?? `#${v.vehicle_number}`}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleRowTitle}>
                    {VEHICLE_TYPE_EMOJI[v.vehicle_type] ?? '🚗'} {v.vehicle_type}
                    {v.vehicle_make ? ` · ${v.vehicle_make}` : ''}
                    {v.vehicle_model ? ` ${v.vehicle_model}` : ''}
                  </Text>
                  {v.vehicle_plate && (
                    <Text style={styles.vehicleRowPlate}>{v.vehicle_plate}</Text>
                  )}
                  {v.status === 'rejected' && v.rejection_reason && (
                    <Text style={styles.vehicleRejectedReason}>Rejected: {v.rejection_reason}</Text>
                  )}
                </View>
              </View>
              <View style={styles.vehicleRowRight}>
                <View style={[styles.vStatusBadge, { backgroundColor: STATUS_COLOR[v.status] + '20' }]}>
                  <Text style={[styles.vStatusText, { color: STATUS_COLOR[v.status] }]}>
                    {v.status === 'pending' ? 'Pending' : v.status === 'approved' ? 'Approved' : 'Rejected'}
                  </Text>
                </View>
                {v.status === 'approved'
                  ? <TouchableOpacity onPress={() => setViewingVehicle(v)} style={styles.vehicleViewBtn}>
                      <Text style={styles.vehicleViewBtnText}>View 🔒</Text>
                    </TouchableOpacity>
                  : <TouchableOpacity onPress={() => openEditVehicle(v)}>
                      <Text style={styles.editBtn}>Edit</Text>
                    </TouchableOpacity>
                }
              </View>
            </View>
          ))
        )}
      </View>

      {/* Documents */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Documents</Text>
        <Text style={styles.docHint}>OR and CR are submitted per vehicle. Driver's license applies to all vehicles.</Text>

        {([
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

      {/* View Approved Vehicle Modal (read-only) */}
      <Modal visible={!!viewingVehicle} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewingVehicle(null)}>
        {viewingVehicle && (
          <View style={styles.modalWrap}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{viewingVehicle.vehicle_type}</Text>
                <View style={[styles.vStatusBadge, { backgroundColor: '#10b98120', alignSelf: 'flex-start', marginTop: 4 }]}>
                  <Text style={[styles.vStatusText, { color: '#10b981' }]}>Approved 🔒</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setViewingVehicle(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {viewingVehicle.vehicle_image_url ? (
                <TouchableOpacity onPress={() => setPreviewVehicleDoc({ label: 'Vehicle Photo', url: viewingVehicle.vehicle_image_url! })}>
                  <Image source={{ uri: viewingVehicle.vehicle_image_url }} style={styles.vehicleViewPhoto} resizeMode="cover" />
                  <Text style={styles.vehicleViewPhotoHint}>Tap to enlarge</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.vehicleViewPhotoEmpty}>
                  <Text style={{ fontSize: 36 }}>
                    {viewingVehicle.vehicle_type === 'Tricycle' ? '🛺' : viewingVehicle.vehicle_type === 'Car' ? '🚕' : viewingVehicle.vehicle_type === 'Van' ? '🚐' : '🏍️'}
                  </Text>
                  <Text style={styles.vehiclePhotoHint}>No photo uploaded</Text>
                </View>
              )}

              <Text style={styles.vehicleViewSection}>VEHICLE DETAILS</Text>
              {([
                ['Type', viewingVehicle.vehicle_type],
                ['Make', viewingVehicle.vehicle_make ?? '—'],
                ['Model', viewingVehicle.vehicle_model ?? '—'],
                ['Plate', viewingVehicle.vehicle_plate ?? '—'],
                ['Color', viewingVehicle.vehicle_color ?? '—'],
                ['Vehicle #', `${['', '1st', '2nd', '3rd', '4th', '5th'][viewingVehicle.vehicle_number] ?? `#${viewingVehicle.vehicle_number}`} Vehicle`],
              ] as [string, string][]).map(([label, val]) => (
                <View key={label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={[styles.infoVal, label === 'Plate' && { fontFamily: 'monospace', letterSpacing: 2 }]}>{val}</Text>
                </View>
              ))}

              <Text style={[styles.vehicleViewSection, { marginTop: 20 }]}>DOCUMENTS</Text>
              {([
                { label: 'Official Receipt (OR)', url: viewingVehicle.or_url },
                { label: 'Certificate of Registration (CR)', url: viewingVehicle.cr_url },
              ]).map(doc => (
                <View key={doc.label} style={styles.docRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{doc.label}</Text>
                    <Text style={[styles.docStatus, doc.url ? styles.docUploaded : styles.docMissing]}>
                      {doc.url ? '✓ Uploaded' : 'Not uploaded'}
                    </Text>
                  </View>
                  {doc.url && (
                    <TouchableOpacity style={styles.docViewBtn} onPress={() => setPreviewVehicleDoc({ label: doc.label, url: doc.url! })}>
                      <Text style={styles.docViewText}>View</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <View style={styles.vehicleLockedNote}>
                <Text style={styles.vehicleLockedNoteText}>This vehicle is approved and cannot be edited. Contact support if changes are needed.</Text>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Add/Edit Vehicle Modal */}
      <Modal visible={showVehicleModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVehicleModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingVehicleId ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
            <TouchableOpacity onPress={() => setShowVehicleModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>VEHICLE TYPE</Text>
            <View style={styles.typeRow}>
              {VEHICLE_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.genderBtn, vehicleForm.vehicle_type === t && styles.genderBtnActive]} onPress={() => setVehicleForm(f => ({ ...f, vehicle_type: t }))}>
                  <Text style={[styles.genderBtnText, vehicleForm.vehicle_type === t && styles.genderBtnTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>MAKE (e.g. Honda)</Text>
            <TextInput style={styles.input} value={vehicleForm.vehicle_make} onChangeText={v => setVehicleForm(f => ({ ...f, vehicle_make: v }))} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>MODEL (e.g. Click 125i)</Text>
            <TextInput style={styles.input} value={vehicleForm.vehicle_model} onChangeText={v => setVehicleForm(f => ({ ...f, vehicle_model: v }))} placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>PLATE NUMBER</Text>
            <TextInput style={styles.input} value={vehicleForm.vehicle_plate} onChangeText={v => setVehicleForm(f => ({ ...f, vehicle_plate: v }))} autoCapitalize="characters" placeholderTextColor="#9ca3af" />
            <Text style={styles.fieldLabel}>COLOR</Text>
            <TextInput style={styles.input} value={vehicleForm.vehicle_color} onChangeText={v => setVehicleForm(f => ({ ...f, vehicle_color: v }))} placeholderTextColor="#9ca3af" />

            <Text style={styles.fieldLabel}>VEHICLE PHOTO</Text>
            <TouchableOpacity style={styles.docPickerBtn} onPress={() => pickVehicleFormImage('vehicle_image_url')} disabled={loadingVehicleDoc === 'vehicle_image_url'}>
              {loadingVehicleDoc === 'vehicle_image_url' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.docPickerText}>{vehicleForm.vehicle_image_url ? '✓ Photo Uploaded' : 'Upload Photo'}</Text>}
            </TouchableOpacity>
            {vehicleForm.vehicle_image_url ? (
              <TouchableOpacity onPress={() => setPreviewVehicleDoc({ label: 'Vehicle Photo', url: vehicleForm.vehicle_image_url })}>
                <Image source={{ uri: vehicleForm.vehicle_image_url }} style={styles.docThumb} resizeMode="cover" />
              </TouchableOpacity>
            ) : null}

            <Text style={styles.fieldLabel}>OFFICIAL RECEIPT (OR)</Text>
            <TouchableOpacity style={styles.docPickerBtn} onPress={() => pickVehicleFormImage('or_url')} disabled={loadingVehicleDoc === 'or_url'}>
              {loadingVehicleDoc === 'or_url' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.docPickerText}>{vehicleForm.or_url ? '✓ OR Uploaded' : 'Upload OR'}</Text>}
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>CERTIFICATE OF REGISTRATION (CR)</Text>
            <TouchableOpacity style={styles.docPickerBtn} onPress={() => pickVehicleFormImage('cr_url')} disabled={loadingVehicleDoc === 'cr_url'}>
              {loadingVehicleDoc === 'cr_url' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.docPickerText}>{vehicleForm.cr_url ? '✓ CR Uploaded' : 'Upload CR'}</Text>}
            </TouchableOpacity>

            {editingVehicleId && (
              <View style={styles.resubmitNote}>
                <Text style={styles.resubmitNoteText}>Saving changes will reset status to Pending for re-verification.</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.saveModalBtn, loadingVehicleForm && styles.disabled]} onPress={handleSaveVehicleForm} disabled={loadingVehicleForm}>
              {loadingVehicleForm ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveModalBtnText}>{editingVehicleId ? 'Save Changes' : 'Submit for Approval'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Vehicle doc preview modal */}
      <Modal visible={!!previewVehicleDoc} transparent animationType="fade" onRequestClose={() => setPreviewVehicleDoc(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVehicleDoc(null)}>
            <Text style={styles.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.previewLabel}>{previewVehicleDoc?.label}</Text>
          {previewVehicleDoc?.url ? <Image source={{ uri: previewVehicleDoc.url }} style={styles.previewImage} resizeMode="contain" /> : null}
        </View>
      </Modal>

      {/* Errand History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Errand History (Sugo)</Text>
        {errandHistory.length === 0 ? (
          <Text style={styles.emptyText}>No errands yet.</Text>
        ) : errandHistory.map(e => (
          <View key={e.id} style={styles.rideItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rideRoute} numberOfLines={1}>
                {e.errand_type === 'buy' ? '🛍️' : e.errand_type === 'pickup_deliver' ? '📦' : '📋'} {e.description ?? '—'}
              </Text>
              <Text style={styles.rideDate} numberOfLines={1}>{e.pickup_label} → {e.dropoff_label}</Text>
              {e.user_name ? <Text style={styles.rideDate}>From: {e.user_name}</Text> : null}
              <Text style={styles.rideDate}>{new Date(e.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.rideFare}>₱{e.fare}</Text>
              <View style={[styles.statusDot, { backgroundColor: e.status === 'completed' ? '#10b981' : '#ef4444' }]} />
            </View>
          </View>
        ))}
      </View>

      {/* App Update */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>App Update</Text>
        {updateReady ? (
          <>
            <Text style={styles.updateStatus}>✅ Update ready to apply</Text>
            <TouchableOpacity style={styles.updateBtn} onPress={applyUpdate}>
              <Text style={styles.updateBtnText}>Restart Now</Text>
            </TouchableOpacity>
          </>
        ) : updateAvailable ? (
          <>
            <Text style={styles.updateStatus}>🔄 New update available</Text>
            {isDownloading ? (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.updateHint}>Downloading...</Text>
                  <Text style={[styles.updateHint, { fontWeight: '700', color: '#030712' }]}>{progress}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.updateBtn} onPress={downloadUpdate}>
                <Text style={styles.updateBtnText}>Download & Install</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Text style={styles.updateStatus}>✅ App is up to date</Text>
            <TouchableOpacity style={styles.checkBtn} onPress={checkForUpdate} disabled={isChecking}>
              <Text style={styles.checkBtnText}>{isChecking ? 'Checking...' : 'Check for Updates'}</Text>
            </TouchableOpacity>
          </>
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
  updateStatus: { fontSize: 13, color: '#374151', marginBottom: 8, marginTop: 4 },
  updateHint: { fontSize: 12, color: '#6b7280' },
  updateBtn: { backgroundColor: '#030712', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  updateBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  checkBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  checkBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  progressTrack: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#10b981', borderRadius: 4 },

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

  // My Vehicles section
  registerVehicleBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  registerVehicleBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  vehicleRejectedReason: { fontSize: 11, color: '#ef4444', marginTop: 2 },
  addVehicleBtn: { backgroundColor: '#030712', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addVehicleBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  vehicleRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  vehicleNumBadge: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 36, alignItems: 'center' },
  vehicleNumText: { fontSize: 10, fontWeight: '800', color: '#374151' },
  vehicleRowTitle: { fontSize: 13, fontWeight: '600', color: '#030712' },
  vehicleRowPlate: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontFamily: 'monospace', letterSpacing: 1.5 },
  vehicleRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  vStatusText: { fontSize: 10, fontWeight: '700' },
  vehicleLockedText: { fontSize: 16 },
  vehicleViewBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  vehicleViewBtnText: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
  vehicleViewPhoto: { width: '100%', height: 160, borderRadius: 12, marginBottom: 4 },
  vehicleViewPhotoHint: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 16 },
  vehicleViewPhotoEmpty: { height: 100, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 4 },
  vehicleViewSection: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 8 },
  vehicleLockedNote: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 20, borderWidth: 1, borderColor: '#bbf7d0' },
  vehicleLockedNoteText: { fontSize: 12, color: '#166534', textAlign: 'center' },

  // Vehicle form modal
  modalWrap: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#030712' },
  modalClose: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  modalBody: { padding: 20, paddingBottom: 40 },
  docPickerBtn: { backgroundColor: '#030712', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  docPickerText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  docThumb: { width: '100%', height: 120, borderRadius: 10, marginBottom: 8 },
  resubmitNote: { backgroundColor: '#fff7ed', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#fed7aa' },
  resubmitNoteText: { fontSize: 12, color: '#92400e' },
  saveModalBtn: { backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveModalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  previewClose: { position: 'absolute', top: 52, right: 20, padding: 10 },
  previewCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  previewImage: { width: '100%', height: 420, borderRadius: 12 },
});
