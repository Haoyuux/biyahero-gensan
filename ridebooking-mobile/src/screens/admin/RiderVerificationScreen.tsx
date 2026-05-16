import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { verifyRider } from '../../lib/adminService';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
const FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  unsubmitted: '#9ca3af',
};

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {children ?? <Text style={s.rowValue}>{value}</Text>}
    </View>
  );
}

export default function RiderVerificationScreen() {
  const [riders, setRiders] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['rider', 'team_leader'])
      .order('created_at', { ascending: false });
    setRiders((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = riders.filter(r => {
    const matchStatus = filter === 'all' || r.rider_status === filter;
    const matchSearch = !search ||
      (r.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleVerify = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!selected) return;
    Alert.alert(
      `${status.charAt(0).toUpperCase() + status.slice(1)} Rider`,
      `Set ${selected.full_name ?? selected.email} to ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setSubmitting(true);
            try {
              await verifyRider(selected.id, status);
              setSelected(null);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Rider Verification</Text>
        <TextInput
          style={s.search}
          placeholder="Search by name or email…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterBtn, filter === f && s.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${riders.filter(r => r.rider_status === f).length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                : <View style={s.avatarPlaceholder}><Text style={s.avatarInitial}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.sub}>{item.email}</Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.rider_status ?? 'unsubmitted']) + '20' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.rider_status ?? 'unsubmitted'] }]}>
                    {item.rider_status ?? 'unsubmitted'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.reviewBtn} onPress={() => setSelected(item)}>
                <Text style={s.reviewBtnText}>Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No riders found</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Review Application</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>PERSONAL INFO</Text>
              <View style={s.infoCard}>
                <Row label="Name" value={selected.full_name ?? '—'} />
                <Row label="Email" value={selected.email} />
                <Row label="Phone" value={selected.phone ?? '—'} />
                <Row label="Status">
                  <View style={[s.badge, { backgroundColor: (STATUS_COLOR[selected.rider_status ?? 'unsubmitted']) + '20' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[selected.rider_status ?? 'unsubmitted'] }]}>
                      {selected.rider_status ?? 'unsubmitted'}
                    </Text>
                  </View>
                </Row>
                {selected.reviewed_by_name && (
                  <Row label="Reviewed by" value={`${selected.reviewed_by_name}${selected.reviewed_at ? ' · ' + new Date(selected.reviewed_at).toLocaleDateString() : ''}`} />
                )}
              </View>

              <Text style={s.sectionLabel}>VEHICLE</Text>
              <View style={s.infoCard}>
                <Row label="Type" value={selected.vehicle_type ?? '—'} />
                <Row label="Make/Model" value={[selected.vehicle_make, selected.vehicle_model].filter(Boolean).join(' ') || '—'} />
                <Row label="Plate" value={selected.vehicle_plate ?? '—'} />
                <Row label="Color" value={selected.vehicle_color ?? '—'} />
              </View>

              <Text style={s.sectionLabel}>DOCUMENTS</Text>
              <View style={s.docsRow}>
                {[
                  { label: "Driver's License", url: selected.license_url },
                  { label: 'OR', url: selected.or_url },
                  { label: 'CR', url: selected.cr_url },
                  { label: 'Vehicle Photo', url: selected.vehicle_image_url },
                ].map(doc => (
                  <View key={doc.label} style={s.docBox}>
                    <Text style={s.docLabel}>{doc.label}</Text>
                    {doc.url
                      ? <Image source={{ uri: doc.url }} style={s.docImg} resizeMode="cover" />
                      : <View style={s.docPlaceholder}><Text style={s.docPlaceholderText}>No file</Text></View>
                    }
                  </View>
                ))}
              </View>

              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#10b981' }, submitting && s.disabled]}
                  disabled={submitting}
                  onPress={() => handleVerify('approved')}
                >
                  <Text style={s.actionBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#ef4444' }, submitting && s.disabled]}
                  disabled={submitting}
                  onPress={() => handleVerify('rejected')}
                >
                  <Text style={s.actionBtnText}>Reject</Text>
                </TouchableOpacity>
                {(selected.rider_status === 'approved' || selected.rider_status === 'rejected') && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#f59e0b' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleVerify('pending')}
                  >
                    <Text style={s.actionBtnText}>Reset to Pending</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  search: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 10,
  },
  filterRow: { marginBottom: 8 },
  filterContent: { gap: 8, paddingRight: 4 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712' },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  reviewBtn: { backgroundColor: '#030712', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  reviewBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#030712', flex: 2, textAlign: 'right' },
  docsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  docBox: { width: '47%' },
  docLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  docImg: { width: '100%', height: 100, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  docPlaceholder: { width: '100%', height: 100, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  docPlaceholderText: { fontSize: 12, color: '#9ca3af' },
  actions: { gap: 10, marginTop: 24 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
