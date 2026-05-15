import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, Alert, TextInput, Image, ScrollView,
} from 'react-native';
import { supabase, Profile, UserRole } from '../../lib/supabase';
import { updateUserRole, blockUser, unblockUser, assignAdminRoles } from '../../lib/adminService';
import { useProfile } from '../../contexts/AuthContext';

const ROLES: UserRole[] = ['user', 'rider', 'team_leader', 'admin', 'super_admin'];
const ROLE_COLOR: Record<string, string> = {
  user: '#6b7280', rider: '#10b981', team_leader: '#8b5cf6',
  admin: '#3b82f6', super_admin: '#f59e0b',
};

interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

export default function UserManagementScreen() {
  const { profile: myProfile } = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [detailUser, setDetailUser] = useState<Profile | null>(null);
  const [blockTarget, setBlockTarget] = useState<Profile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [rolesTarget, setRolesTarget] = useState<Profile | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('admin_roles').select('*').order('name'),
    ]);
    setUsers((profileData ?? []) as Profile[]);
    setAdminRoles((roleData ?? []) as AdminRole[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    !search ||
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const isSelf = (u: Profile) => u.id === myProfile.id;
  const isSuperAdmin = (u: Profile) => u.role === 'super_admin';

  // Role change
  const handleRoleChange = async (newRole: UserRole) => {
    if (!roleTarget) return;
    if (newRole === 'super_admin') {
      Alert.alert('Caution', 'Setting super_admin grants full platform control. Confirm?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => doRoleChange(newRole) },
      ]);
      return;
    }
    doRoleChange(newRole);
  };

  const doRoleChange = async (newRole: UserRole) => {
    if (!roleTarget) return;
    setSubmitting(true);
    try {
      await updateUserRole(roleTarget.id, newRole);
      setRoleTarget(null);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  // Block
  const handleBlock = async () => {
    if (!blockTarget || !blockReason.trim()) {
      Alert.alert('Required', 'Please enter a reason.'); return;
    }
    setSubmitting(true);
    try {
      await blockUser(blockTarget.id, blockReason.trim(), myProfile.full_name ?? 'Admin');
      setBlockTarget(null);
      setBlockReason('');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleUnblock = async (user: Profile) => {
    Alert.alert('Unblock', `Unblock ${user.full_name ?? user.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: async () => {
          try { await unblockUser(user.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  // Admin roles assignment
  const openRolesModal = (user: Profile) => {
    setRolesTarget(user);
    setSelectedRoleIds(user.admin_role_ids ?? []);
  };

  const toggleRoleId = (id: string) => {
    setSelectedRoleIds(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id],
    );
  };

  const saveAdminRoles = async () => {
    if (!rolesTarget) return;
    setSubmitting(true);
    try {
      await assignAdminRoles(rolesTarget.id, selectedRoleIds);
      setRolesTarget(null);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>User Management</Text>
        <TextInput
          style={s.search}
          placeholder="Search name or email…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
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
                : <View style={s.avatarPH}><Text style={s.avatarInit}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.full_name ?? '—'}</Text>
                <Text style={s.email} numberOfLines={1}>{item.email}</Text>
                <View style={s.badgeRow}>
                  <View style={[s.roleBadge, { backgroundColor: (ROLE_COLOR[item.role] ?? '#6b7280') + '20' }]}>
                    <Text style={[s.roleBadgeText, { color: ROLE_COLOR[item.role] ?? '#6b7280' }]}>{item.role.replace('_', ' ')}</Text>
                  </View>
                  {item.is_blocked && <View style={s.blockedBadge}><Text style={s.blockedBadgeText}>Blocked</Text></View>}
                </View>
              </View>
              <View style={s.cardBtns}>
                <TouchableOpacity style={s.detailBtn} onPress={() => setDetailUser(item)}>
                  <Text style={s.detailBtnText}>Details</Text>
                </TouchableOpacity>
                {!isSelf(item) && !isSuperAdmin(item) && (
                  <TouchableOpacity style={s.roleBtn} onPress={() => setRoleTarget(item)}>
                    <Text style={s.roleBtnText}>Role</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No users found</Text>}
        contentContainerStyle={s.list}
      />

      {/* User Detail Modal */}
      <Modal visible={!!detailUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailUser(null)}>
        {detailUser && (
          <SafeAreaView style={s.safe}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>User Details</Text>
              <TouchableOpacity onPress={() => setDetailUser(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.avatarCenter}>
                {detailUser.avatar_url
                  ? <Image source={{ uri: detailUser.avatar_url }} style={s.detailAvatar} />
                  : <View style={[s.avatarPH, { width: 64, height: 64, borderRadius: 32 }]}><Text style={{ fontSize: 26, fontWeight: '700', color: '#6b7280' }}>{(detailUser.full_name ?? detailUser.email)[0].toUpperCase()}</Text></View>
                }
                <View style={[s.roleBadge, { backgroundColor: (ROLE_COLOR[detailUser.role] ?? '#6b7280') + '20', marginTop: 8 }]}>
                  <Text style={[s.roleBadgeText, { color: ROLE_COLOR[detailUser.role] ?? '#6b7280' }]}>{detailUser.role.replace('_', ' ')}</Text>
                </View>
              </View>

              <Text style={s.sectionLabel}>PROFILE</Text>
              <View style={s.infoCard}>
                <DetailRow label="Full Name" value={detailUser.full_name ?? '—'} />
                <DetailRow label="Email" value={detailUser.email} />
                <DetailRow label="Phone" value={detailUser.phone ?? '—'} />
                <DetailRow label="Birthday" value={detailUser.birthday ?? '—'} />
                <DetailRow label="Sex" value={detailUser.sex ?? '—'} />
                <DetailRow label="Joined" value={new Date(detailUser.id.slice(0, 10)).toLocaleDateString()} />
              </View>

              {(detailUser.role === 'rider' || detailUser.role === 'team_leader') && (
                <>
                  <Text style={s.sectionLabel}>RIDER INFO</Text>
                  <View style={s.infoCard}>
                    <DetailRow label="Status" value={detailUser.rider_status ?? '—'} />
                    <DetailRow label="Vehicle" value={[detailUser.vehicle_type, detailUser.vehicle_make, detailUser.vehicle_model].filter(Boolean).join(' ') || '—'} />
                    <DetailRow label="Plate" value={detailUser.vehicle_plate ?? '—'} />
                  </View>
                </>
              )}

              {detailUser.is_blocked && (
                <>
                  <Text style={s.sectionLabel}>BLOCK INFO</Text>
                  <View style={s.infoCard}>
                    <DetailRow label="Blocked by" value={detailUser.blocked_by ?? '—'} />
                    <DetailRow label="Reason" value={detailUser.block_reason ?? '—'} />
                    <DetailRow label="Date" value={detailUser.blocked_at ? new Date(detailUser.blocked_at).toLocaleString() : '—'} />
                  </View>
                </>
              )}

              {/* Actions */}
              {!isSelf(detailUser) && !isSuperAdmin(detailUser) && (
                <View style={s.actionsList}>
                  <TouchableOpacity style={s.actionRow} onPress={() => { setDetailUser(null); setRoleTarget(detailUser); }}>
                    <Text style={s.actionText}>Change Role</Text>
                  </TouchableOpacity>
                  {(detailUser.role === 'admin') && (
                    <TouchableOpacity style={s.actionRow} onPress={() => { setDetailUser(null); openRolesModal(detailUser); }}>
                      <Text style={s.actionText}>Assign Admin Roles</Text>
                    </TouchableOpacity>
                  )}
                  {detailUser.is_blocked
                    ? (
                      <TouchableOpacity style={[s.actionRow, s.actionUnblock]} onPress={() => { setDetailUser(null); handleUnblock(detailUser); }}>
                        <Text style={[s.actionText, { color: '#059669' }]}>Unblock User</Text>
                      </TouchableOpacity>
                    )
                    : (
                      <TouchableOpacity style={[s.actionRow, s.actionBlock]} onPress={() => { setDetailUser(null); setBlockTarget(detailUser); setBlockReason(''); }}>
                        <Text style={[s.actionText, { color: '#ef4444' }]}>Block User</Text>
                      </TouchableOpacity>
                    )
                  }
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Role Change Sheet */}
      <Modal visible={!!roleTarget} animationType="slide" transparent onRequestClose={() => setRoleTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Change Role</Text>
            <Text style={s.sheetSub}>{roleTarget?.full_name ?? roleTarget?.email}</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {ROLES.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleOption, roleTarget?.role === role && s.roleOptionCurrent, submitting && s.disabled]}
                  disabled={submitting || roleTarget?.role === role}
                  onPress={() => handleRoleChange(role)}
                >
                  <View style={[s.roleDot, { backgroundColor: ROLE_COLOR[role] }]} />
                  <Text style={[s.roleOptionText, roleTarget?.role === role && { color: '#9ca3af' }]}>{role.replace('_', ' ')}</Text>
                  {roleTarget?.role === role && <Text style={s.currentTag}>current</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setRoleTarget(null)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Block Sheet */}
      <Modal visible={!!blockTarget} animationType="slide" transparent onRequestClose={() => setBlockTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Block User</Text>
            <Text style={s.sheetSub}>{blockTarget?.full_name ?? blockTarget?.email}</Text>
            <TextInput
              style={s.reasonInput}
              placeholder="Reason for blocking (required)…"
              placeholderTextColor="#9ca3af"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              autoFocus
            />
            <View style={s.sheetBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setBlockTarget(null)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.blockConfirmBtn, submitting && s.disabled]} disabled={submitting} onPress={handleBlock}><Text style={s.blockConfirmBtnText}>Block</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Roles Assignment Sheet */}
      <Modal visible={!!rolesTarget} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRolesTarget(null)}>
        {rolesTarget && (
          <SafeAreaView style={s.safe}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Assign Admin Roles</Text>
              <TouchableOpacity onPress={() => setRolesTarget(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalContent}>
              <Text style={s.sheetSub}>{rolesTarget.full_name ?? rolesTarget.email}</Text>
              {adminRoles.length === 0 ? (
                <Text style={s.empty}>No admin roles defined yet. Create them in Roles & Permissions.</Text>
              ) : (
                adminRoles.map(role => (
                  <TouchableOpacity key={role.id} style={s.roleCheckRow} onPress={() => toggleRoleId(role.id)}>
                    <View style={[s.checkbox, selectedRoleIds.includes(role.id) && s.checkboxActive]}>
                      {selectedRoleIds.includes(role.id) && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.roleCheckName}>{role.name}</Text>
                      {role.description && <Text style={s.roleCheckDesc}>{role.description}</Text>}
                    </View>
                    <Text style={s.moduleCount}>{role.modules.length} modules</Text>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity style={[s.saveBtn, submitting && s.disabled]} disabled={submitting} onPress={saveAdminRoles}>
                <Text style={s.saveBtnText}>{submitting ? 'Saving…' : 'Save Role Assignments'}</Text>
              </TouchableOpacity>
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
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 8 },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardBlocked: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPH: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 1 },
  email: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  blockedBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  blockedBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  cardBtns: { gap: 6 },
  detailBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailBtnText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  roleBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  roleBtnText: { fontSize: 11, fontWeight: '600', color: '#3b82f6' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  modalContent: { padding: 20, paddingBottom: 40 },
  avatarCenter: { alignItems: 'center', marginBottom: 16 },
  detailAvatar: { width: 64, height: 64, borderRadius: 32 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  detailLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#030712', flex: 2, textAlign: 'right' },
  actionsList: { marginTop: 20, gap: 2 },
  actionRow: { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  actionUnblock: { borderColor: '#d1fae5' },
  actionBlock: { borderColor: '#fecaca' },
  actionText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 6 },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  roleOptionCurrent: { opacity: 0.4 },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: '#030712', textTransform: 'capitalize', flex: 1 },
  currentTag: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic' },
  reasonInput: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6', marginTop: 12 },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  blockConfirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#ef4444' },
  blockConfirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  roleCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkmark: { fontSize: 12, color: '#fff', fontWeight: '700' },
  roleCheckName: { fontSize: 14, fontWeight: '600', color: '#030712' },
  roleCheckDesc: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  moduleCount: { fontSize: 11, color: '#9ca3af' },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
