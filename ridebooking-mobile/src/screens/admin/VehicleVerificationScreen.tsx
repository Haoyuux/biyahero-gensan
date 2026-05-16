import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

async function callAdminFn(name: string, body: object): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? `${name} failed`);
  }
  return res.json();
}

interface VehicleRow {
  id: string;
  rider_id: string;
  vehicle_number: number;
  vehicle_type: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_image_url: string | null;
  or_url: string | null;
  cr_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  // joined from profiles
  rider_name: string | null;
  rider_email: string | null;
  rider_avatar: string | null;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
const FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
};

const VEHICLE_TYPE_EMOJI: Record<string, string> = {
  Motorcycle: '🏍️',
  Tricycle: '🛺',
  Car: '🚕',
  Van: '🚐',
};

export default function VehicleVerificationScreen() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<VehicleRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ label: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('vehicles')
      .select(`
        *,
        profiles!vehicles_rider_id_fkey (
          full_name,
          email,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    const rows: VehicleRow[] = (data ?? []).map((r: any) => ({
      ...r,
      rider_name: r.profiles?.full_name ?? null,
      rider_email: r.profiles?.email ?? null,
      rider_avatar: r.profiles?.avatar_url ?? null,
    }));
    setVehicles(rows);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = vehicles.filter(v => {
    const matchStatus = filter === 'all' || v.status === filter;
    const matchSearch = !search ||
      (v.rider_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (v.rider_email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (v.vehicle_plate ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleVerify = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!selected) return;
    if (status === 'rejected' && !rejectReason.trim()) {
      Alert.alert('Required', 'Enter a rejection reason.');
      return;
    }

    setSubmitting(true);
    try {
      await callAdminFn('admin-verify-vehicle', {
        vehicleId: selected.id,
        status,
        rejectionReason: status === 'rejected' ? rejectReason.trim() : undefined,
      });
      setSelected(null);
      setRejectReason('');
      await load();
      Alert.alert('Updated', `Vehicle set to ${status}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Vehicle Verification</Text>
        <Text style={s.pageCount}>{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      <TextInput
        style={s.searchInput}
        placeholder="Search by name, email, or plate..."
        placeholderTextColor="#9ca3af"
        value={search}
        onChangeText={setSearch}
      />

      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={v => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => { setSelected(item); setRejectReason(item.rejection_reason ?? ''); }}>
            <View style={s.cardTop}>
              <View style={s.riderRow}>
                {item.rider_avatar
                  ? <Image source={{ uri: item.rider_avatar }} style={s.avatar} />
                  : <View style={s.avatarPH}><Text style={s.avatarInit}>{(item.rider_name ?? '?')[0].toUpperCase()}</Text></View>
                }
                <View>
                  <Text style={s.riderName}>{item.rider_name ?? 'Unknown'}</Text>
                  <Text style={s.riderEmail}>{item.rider_email}</Text>
                </View>
              </View>
              <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                <Text style={[s.statusText, { color: STATUS_COLOR[item.status] }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
            </View>
            <View style={s.vehicleInfo}>
              <View style={s.vehicleNumBadge}>
                <Text style={s.vehicleNumText}>{ORDINAL[item.vehicle_number] ?? `#${item.vehicle_number}`} Vehicle</Text>
              </View>
              <Text style={s.vehicleDetail}>
                {VEHICLE_TYPE_EMOJI[item.vehicle_type] ?? '🚗'} {item.vehicle_type}
                {item.vehicle_make ? ` · ${item.vehicle_make}` : ''}
                {item.vehicle_model ? ` ${item.vehicle_model}` : ''}
              </Text>
              {item.vehicle_plate && <Text style={s.vehiclePlate}>{item.vehicle_plate}</Text>}
              <Text style={s.vehicleDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            {item.rejection_reason && (
              <Text style={s.rejectionText}>Reason: {item.rejection_reason}</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No vehicles found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Detail / Action Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Vehicle Review</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {/* Rider info */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>RIDER</Text>
                <View style={s.riderRow}>
                  {selected.rider_avatar
                    ? <Image source={{ uri: selected.rider_avatar }} style={s.avatar} />
                    : <View style={s.avatarPH}><Text style={s.avatarInit}>{(selected.rider_name ?? '?')[0].toUpperCase()}</Text></View>
                  }
                  <View>
                    <Text style={s.riderName}>{selected.rider_name ?? 'Unknown'}</Text>
                    <Text style={s.riderEmail}>{selected.rider_email}</Text>
                  </View>
                </View>
              </View>

              {/* Vehicle info */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>VEHICLE — {ORDINAL[selected.vehicle_number] ?? `#${selected.vehicle_number}`}</Text>
                {[
                  ['Type', `${VEHICLE_TYPE_EMOJI[selected.vehicle_type] ?? ''} ${selected.vehicle_type}`],
                  ['Make', selected.vehicle_make ?? '—'],
                  ['Model', selected.vehicle_model ?? '—'],
                  ['Plate', selected.vehicle_plate ?? '—'],
                  ['Color', selected.vehicle_color ?? '—'],
                  ['Submitted', new Date(selected.created_at).toLocaleString()],
                ].map(([label, val]) => (
                  <View key={label} style={s.detailRow}>
                    <Text style={s.detailLabel}>{label}</Text>
                    <Text style={[s.detailVal, label === 'Plate' && { fontFamily: 'monospace', letterSpacing: 2 }]}>{val}</Text>
                  </View>
                ))}
              </View>

              {/* Documents */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>DOCUMENTS</Text>
                {[
                  { label: 'Vehicle Photo', url: selected.vehicle_image_url },
                  { label: 'Official Receipt (OR)', url: selected.or_url },
                  { label: 'Certificate of Registration (CR)', url: selected.cr_url },
                ].map(doc => (
                  <View key={doc.label} style={s.docRow}>
                    <Text style={s.docLabel}>{doc.label}</Text>
                    {doc.url ? (
                      <TouchableOpacity style={s.docViewBtn} onPress={() => setPreviewDoc({ label: doc.label, url: doc.url! })}>
                        <Text style={s.docViewText}>View</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={s.docMissing}>Not uploaded</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Status badge */}
              <View style={[s.currentStatusBadge, { backgroundColor: STATUS_COLOR[selected.status] + '15', borderColor: STATUS_COLOR[selected.status] + '50' }]}>
                <Text style={[s.currentStatusText, { color: STATUS_COLOR[selected.status] }]}>
                  Current: {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                </Text>
              </View>

              {/* Rejection reason input */}
              <TextInput
                style={s.rejectInput}
                placeholder="Rejection reason (required when rejecting)"
                placeholderTextColor="#9ca3af"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
              />

              {/* Action buttons */}
              {submitting ? (
                <ActivityIndicator color="#10b981" style={{ marginTop: 20 }} />
              ) : (
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={s.approveBtn}
                    onPress={() => handleVerify('approved')}
                    disabled={submitting}
                  >
                    <Text style={s.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.pendingBtn}
                    onPress={() => handleVerify('pending')}
                    disabled={submitting}
                  >
                    <Text style={s.pendingBtnText}>Set Pending</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.rejectBtn}
                    onPress={() => handleVerify('rejected')}
                    disabled={submitting}
                  >
                    <Text style={s.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Document preview */}
      <Modal visible={!!previewDoc} transparent animationType="fade" onRequestClose={() => setPreviewDoc(null)}>
        <View style={s.previewOverlay}>
          <TouchableOpacity style={s.previewClose} onPress={() => setPreviewDoc(null)}>
            <Text style={s.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={s.previewLabel}>{previewDoc?.label}</Text>
          {previewDoc?.url ? <Image source={{ uri: previewDoc.url }} style={s.previewImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712' },
  pageCount: { fontSize: 12, color: '#9ca3af' },
  searchInput: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  filterBtnActive: { backgroundColor: '#030712' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  filterTextActive: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPH: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  riderName: { fontSize: 14, fontWeight: '600', color: '#030712' },
  riderEmail: { fontSize: 11, color: '#9ca3af' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  vehicleInfo: { gap: 3 },
  vehicleNumBadge: { backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  vehicleNumText: { fontSize: 10, fontWeight: '800', color: '#374151' },
  vehicleDetail: { fontSize: 13, fontWeight: '600', color: '#374151' },
  vehiclePlate: { fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', letterSpacing: 1.5 },
  vehicleDate: { fontSize: 11, color: '#d1d5db', marginTop: 2 },
  rejectionText: { marginTop: 6, fontSize: 12, color: '#ef4444', fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },

  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  modalBody: { padding: 20, paddingBottom: 40 },
  detailSection: { marginBottom: 20 },
  detailSectionTitle: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  detailLabel: { fontSize: 13, color: '#9ca3af' },
  detailVal: { fontSize: 13, fontWeight: '600', color: '#030712', maxWidth: '60%', textAlign: 'right' },
  docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  docLabel: { fontSize: 13, color: '#374151' },
  docViewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  docViewText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  docMissing: { fontSize: 12, color: '#d1d5db' },
  currentStatusBadge: { borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, marginBottom: 14 },
  currentStatusText: { fontSize: 14, fontWeight: '700' },
  rejectInput: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 16, minHeight: 70, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10 },
  approveBtn: { flex: 1, backgroundColor: '#10b981', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  pendingBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  pendingBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  rejectBtn: { flex: 1, backgroundColor: '#fef2f2', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },

  // Doc preview
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  previewClose: { position: 'absolute', top: 52, right: 20, padding: 10 },
  previewCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  previewImage: { width: '100%', height: 420, borderRadius: 12 },
});
