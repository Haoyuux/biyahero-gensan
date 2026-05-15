import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { updateUserRole, blockUser, unblockUser } from '../../lib/adminService';
import { useProfile } from '../../contexts/AuthContext';

const ROLES = ['rider', 'team_leader'] as const;
type RiderRole = typeof ROLES[number];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export default function DriverManagementScreen() {
  const { profile: adminProfile } = useProfile();
  const [riders, setRiders] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlock, setShowBlock] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['rider', 'team_leader'])
      .eq('rider_status', 'approved')
      .order('full_name', { ascending: true });
    setRiders((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = riders.filter(r =>
    !search ||
    (r.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.vehicle_plate ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleRoleChange = async (role: RiderRole) => {
    if (!selected) return;
    Alert.alert('Change Role', `Set ${selected.full_name ?? selected.email} as ${role}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setSubmitting(true);
          try {
            await updateUserRole(selected.id, role);
            setSelected(null);
            await load();
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setSubmitting(false); }
        },
      },
    ]);
  };

  const handleBlock = async () => {
    if (!selected || !blockReason.trim()) return;
    setSubmitting(true);
    try {
      await blockUser(selected.id, blockReason.trim(), adminProfile.full_name ?? 'Admin');
      setShowBlock(false);
      setSelected(null);
      setBlockReason('');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleUnblock = async (rider: Profile) => {
    Alert.alert('Unblock', `Unblock ${rider.full_name ?? rider.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: async () => {
          try { await unblockUser(rider.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Driver Management</Text>
        <TextInput
          style={s.search}
          placeholder="Search name, email or plate…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={[s.card, item.is_blocked && s.cardBlocked]}>
            <View style={s.cardRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                : <View style={s.avatarPH}><Text style={s.avatarInit}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.sub}>{[item.vehicle_type, item.vehicle_make, item.vehicle_plate].filter(Boolean).join(' · ')}</Text>
                <View style={s.badgeRow}>
                  <View style={s.roleBadge}><Text style={s.roleBadgeText}>{item.role}</Text></View>
                  {item.is_blocked && <View style={s.blockedBadge}><Text style={s.blockedText}>Blocked</Text></View>}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity style={s.viewBtn} onPress={() => setSelected(item)}>
                  <Text style={s.viewBtnText}>View</Text>
                </TouchableOpacity>
                {item.is_blocked
                  ? <TouchableOpacity style={s.unblockBtn} onPress={() => handleUnblock(item)}><Text style={s.unblockBtnText}>Unblock</Text></TouchableOpacity>
                  : <TouchableOpacity style={s.blockBtn} onPress={() => { setSelected(item); setBlockReason(''); setShowBlock(true); }}><Text style={s.blockBtnText}>Block</Text></TouchableOpacity>
                }
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No approved riders found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Detail Modal */}
      <Modal visible={!!selected && !showBlock} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Rider Profile</Text>
                <TouchableOpacity onPress={() => setSelected(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>PERSONAL INFO</Text>
              <View style={s.infoCard}>
                <Row label="Name" value={selected.full_name ?? '—'} />
                <Row label="Email" value={selected.email} />
                <Row label="Phone" value={selected.phone ?? '—'} />
                <Row label="Role" value={selected.role} />
              </View>

              <Text style={s.sectionLabel}>VEHICLE</Text>
              <View style={s.infoCard}>
                <Row label="Type" value={selected.vehicle_type ?? '—'} />
                <Row label="Make/Model" value={[selected.vehicle_make, selected.vehicle_model].filter(Boolean).join(' ') || '—'} />
                <Row label="Plate" value={selected.vehicle_plate ?? '—'} />
                <Row label="Color" value={selected.vehicle_color ?? '—'} />
              </View>

              <Text style={s.sectionLabel}>CHANGE ROLE</Text>
              <View style={s.actionsRow}>
                {ROLES.map(role => (
                  <TouchableOpacity
                    key={role}
                    style={[s.roleBtn, selected.role === role && s.roleBtnActive, submitting && s.disabled]}
                    disabled={submitting || selected.role === role}
                    onPress={() => handleRoleChange(role)}
                  >
                    <Text style={[s.roleBtnText, selected.role === role && s.roleBtnTextActive]}>
                      {role === 'rider' ? 'Rider' : 'Team Leader'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Block Sheet */}
      <Modal visible={showBlock && !!selected} animationType="slide" transparent onRequestClose={() => setShowBlock(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Block Driver</Text>
            <Text style={s.sheetSub}>{selected?.full_name ?? selected?.email}</Text>
            <TextInput
              style={s.reasonInput}
              placeholder="Reason (required)…"
              placeholderTextColor="#9ca3af"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              autoFocus
            />
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowBlock(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, submitting && s.disabled]} disabled={submitting} onPress={handleBlock}>
                <Text style={s.confirmBtnText}>Block</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 8 },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardBlocked: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPH: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  sub: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  roleBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '600', color: '#059669', textTransform: 'capitalize' },
  blockedBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  blockedText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  viewBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  viewBtnText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  blockBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  blockBtnText: { fontSize: 11, fontWeight: '600', color: '#ef4444' },
  unblockBtn: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  unblockBtnText: { fontSize: 11, fontWeight: '600', color: '#059669' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 13, color: '#6b7280' },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#030712', textAlign: 'right', maxWidth: '60%' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  roleBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  roleBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  roleBtnTextActive: { color: '#10b981' },
  disabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  reasonInput: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  sheetActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
