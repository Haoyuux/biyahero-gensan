import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { blockUser, unblockUser } from '../../lib/adminService';
import { useProfile } from '../../contexts/AuthContext';

type RoleFilter = 'all' | 'user' | 'rider';
type BlockFilter = 'all' | 'blocked' | 'active';

export default function UserBlockingScreen() {
  const { profile: adminProfile } = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [blockFilter, setBlockFilter] = useState<BlockFilter>('all');
  const [blockTarget, setBlockTarget] = useState<Profile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [unblockTarget, setUnblockTarget] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['user', 'rider', 'team_leader'])
      .order('created_at', { ascending: false })
      .limit(200);
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (blockFilter === 'blocked' && !u.is_blocked) return false;
    if (blockFilter === 'active' && u.is_blocked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.full_name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const handleBlock = async () => {
    if (!blockTarget) return;
    if (!blockReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for blocking.');
      return;
    }
    setSubmitting(true);
    try {
      await blockUser(blockTarget.id, blockReason.trim(), adminProfile.full_name ?? 'Admin');
      setBlockTarget(null);
      setBlockReason('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblock = async () => {
    if (!unblockTarget) return;
    setSubmitting(true);
    try {
      await unblockUser(unblockTarget.id);
      setUnblockTarget(null);
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
        <Text style={s.pageTitle}>User Blocking</Text>
        <TextInput
          style={s.search}
          placeholder="Search name or email…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
          {(['all', 'user', 'rider'] as RoleFilter[]).map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, roleFilter === f && s.filterBtnActive]} onPress={() => setRoleFilter(f)}>
              <Text style={[s.filterText, roleFilter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
          <View style={s.divider} />
          {(['all', 'active', 'blocked'] as BlockFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterBtn, blockFilter === f && (f === 'blocked' ? s.filterBtnDanger : s.filterBtnActive)]}
              onPress={() => setBlockFilter(f)}
            >
              <Text style={[s.filterText, blockFilter === f && (f === 'blocked' ? s.filterTextDanger : s.filterTextActive)]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={[s.card, item.is_blocked && s.cardBlocked]}>
            <View style={s.cardRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                : <View style={s.avatarPlaceholder}><Text style={s.avatarInitial}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.sub}>{item.email}</Text>
                <View style={s.badgeRow}>
                  <View style={s.roleBadge}><Text style={s.roleBadgeText}>{item.role}</Text></View>
                  {item.is_blocked && <View style={s.blockedBadge}><Text style={s.blockedBadgeText}>Blocked</Text></View>}
                </View>
                {item.is_blocked && item.block_reason && (
                  <Text style={s.blockReasonText} numberOfLines={1}>Reason: {item.block_reason}</Text>
                )}
              </View>
              {item.is_blocked
                ? (
                  <TouchableOpacity style={s.unblockBtn} onPress={() => setUnblockTarget(item)}>
                    <Text style={s.unblockBtnText}>Unblock</Text>
                  </TouchableOpacity>
                )
                : (
                  <TouchableOpacity style={s.blockBtn} onPress={() => { setBlockTarget(item); setBlockReason(''); }}>
                    <Text style={s.blockBtnText}>Block</Text>
                  </TouchableOpacity>
                )
              }
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No users found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Block Modal */}
      <Modal visible={!!blockTarget} animationType="slide" transparent onRequestClose={() => setBlockTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Block User</Text>
            <Text style={s.sheetSub}>{blockTarget?.full_name ?? blockTarget?.email}</Text>
            <Text style={s.sheetLabel}>Reason (required)</Text>
            <TextInput
              style={s.reasonInput}
              placeholder="Enter reason for blocking…"
              placeholderTextColor="#9ca3af"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setBlockTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBlockBtn, submitting && s.disabled]}
                disabled={submitting}
                onPress={handleBlock}
              >
                <Text style={s.confirmBtnText}>Block User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unblock Confirm */}
      <Modal visible={!!unblockTarget} animationType="slide" transparent onRequestClose={() => setUnblockTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Unblock User</Text>
            <Text style={s.sheetSub}>{unblockTarget?.full_name ?? unblockTarget?.email}</Text>
            <Text style={s.sheetNote}>This will restore full platform access for this user.</Text>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setUnblockTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmUnblockBtn, submitting && s.disabled]}
                disabled={submitting}
                onPress={handleUnblock}
              >
                <Text style={s.confirmBtnText}>Confirm Unblock</Text>
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
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 10 },
  filtersRow: { gap: 8, paddingRight: 4, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterBtnDanger: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  filterTextDanger: { color: '#ef4444' },
  divider: { width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 4 },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardBlocked: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  roleBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  blockedBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  blockedBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  blockReasonText: { fontSize: 11, color: '#ef4444', marginTop: 4 },
  blockBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  blockBtnText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  unblockBtn: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#6ee7b7' },
  unblockBtnText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  sheetLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  sheetNote: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  reasonInput: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  sheetActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBlockBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmUnblockBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#10b981' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
