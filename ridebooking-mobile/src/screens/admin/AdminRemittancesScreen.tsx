import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Remittance } from '../../lib/remittanceService';
import { reviewRemittance } from '../../lib/adminService';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
const FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
};

function MRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {children ?? <Text style={s.rowValue}>{value}</Text>}
    </View>
  );
}

export default function AdminRemittancesScreen() {
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Remittance | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('remittances')
      .select('*')
      .order('remittance_date', { ascending: false })
      .limit(100);
    setRemittances((data ?? []) as Remittance[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? remittances : remittances.filter(r => r.status === filter);

  const openReview = (item: Remittance) => {
    setSelected(item);
    setNotes(item.admin_notes ?? '');
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await reviewRemittance(selected.id, status, notes.trim() || undefined);
      setSelected(null);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Remittances</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${remittances.filter(r => r.status === f).length})`}
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
              <View style={{ flex: 1 }}>
                <Text style={s.riderName}>{item.rider_name ?? item.rider_id.slice(0, 8)}</Text>
                <Text style={s.sub}>{item.remittance_date}</Text>
                <Text style={s.fare}>Due: ₱{item.total_booking_fee.toFixed(2)} · Remitted: ₱{item.amount_remitted.toFixed(2)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <View style={[s.badge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
                </View>
                <TouchableOpacity style={s.reviewBtn} onPress={() => openReview(item)}>
                  <Text style={s.reviewBtnText}>Review</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No remittances found</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Review Remittance</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>SUMMARY</Text>
              <View style={s.infoCard}>
                <MRow label="Rider" value={selected.rider_name ?? selected.rider_id.slice(0, 8)} />
                <MRow label="Date" value={selected.remittance_date} />
                <MRow label="Rides" value={String(selected.rides_count ?? 0)} />
                <MRow label="Total Earnings" value={`₱${selected.total_earnings.toFixed(2)}`} />
                <MRow label="Booking Fee Due" value={`₱${selected.total_booking_fee.toFixed(2)}`} />
                <MRow label="Amount Remitted" value={`₱${selected.amount_remitted.toFixed(2)}`} />
                <MRow label="Status">
                  <View style={[s.badge, { backgroundColor: STATUS_COLOR[selected.status] + '20' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[selected.status] }]}>{selected.status}</Text>
                  </View>
                </MRow>
              </View>

              {selected.receipt_url && (
                <>
                  <Text style={s.sectionLabel}>RECEIPT</Text>
                  <TouchableOpacity onPress={() => setReceiptVisible(true)}>
                    <Image source={{ uri: selected.receipt_url }} style={s.receiptThumb} resizeMode="cover" />
                    <Text style={s.tapHint}>Tap to view full size</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={s.sectionLabel}>ADMIN NOTES</Text>
              <TextInput
                style={s.notesInput}
                placeholder="Optional notes…"
                placeholderTextColor="#9ca3af"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />

              {selected.status === 'pending' && (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#10b981' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleReview('approved')}
                  >
                    <Text style={s.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#ef4444' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleReview('rejected')}
                  >
                    <Text style={s.actionBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      <Modal visible={receiptVisible} animationType="fade" onRequestClose={() => setReceiptVisible(false)}>
        <View style={s.receiptFull}>
          <TouchableOpacity style={s.receiptClose} onPress={() => setReceiptVisible(false)}>
            <Text style={s.receiptCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {selected?.receipt_url && (
            <Image source={{ uri: selected.receipt_url }} style={s.receiptFullImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  filterRow: { marginBottom: 8 },
  filterContent: { gap: 8, paddingRight: 4 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderName: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  sub: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  fare: { fontSize: 12, color: '#6b7280' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  reviewBtn: { backgroundColor: '#030712', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  reviewBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
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
  receiptThumb: { width: '100%', height: 180, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 4 },
  tapHint: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 8 },
  notesInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top',
  },
  actions: { gap: 10, marginTop: 24 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
  receiptFull: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  receiptClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  receiptCloseText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  receiptFullImg: { width: '100%', height: '80%' },
});
