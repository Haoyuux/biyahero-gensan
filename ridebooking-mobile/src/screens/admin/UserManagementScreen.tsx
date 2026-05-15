import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, Alert, TextInput, Image, ScrollView,
} from 'react-native';
import { supabase, Profile, UserRole } from '../../lib/supabase';
import { updateUserRole } from '../../lib/adminService';

const ROLES: UserRole[] = ['user', 'rider', 'team_leader', 'admin', 'super_admin'];
const ROLE_COLOR: Record<string, string> = {
  user: '#6b7280', rider: '#10b981', team_leader: '#8b5cf6',
  admin: '#3b82f6', super_admin: '#f59e0b',
};

export default function UserManagementScreen() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    !search ||
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRoleChange = async (newRole: UserRole) => {
    if (!roleTarget) return;
    if (newRole === 'super_admin') {
      Alert.alert('Caution', 'Setting super_admin grants full platform control. Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => doRoleChange(newRole) },
      ]);
      return;
    }
    await doRoleChange(newRole);
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
          <View style={s.card}>
            <View style={s.cardRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                : <View style={s.avatarPH}><Text style={s.avatarInit}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.email}>{item.email}</Text>
                <View style={[s.roleBadge, { backgroundColor: (ROLE_COLOR[item.role] ?? '#6b7280') + '20' }]}>
                  <Text style={[s.roleBadgeText, { color: ROLE_COLOR[item.role] ?? '#6b7280' }]}>{item.role.replace('_', ' ')}</Text>
                </View>
              </View>
              <TouchableOpacity style={s.changeBtn} onPress={() => setRoleTarget(item)}>
                <Text style={s.changeBtnText}>Role</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No users found</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={!!roleTarget} animationType="slide" transparent onRequestClose={() => setRoleTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Change Role</Text>
            <Text style={s.sheetSub}>{roleTarget?.full_name ?? roleTarget?.email}</Text>
            <Text style={s.currentRole}>Current: <Text style={{ color: ROLE_COLOR[roleTarget?.role ?? 'user'] }}>{roleTarget?.role?.replace('_', ' ')}</Text></Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {ROLES.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleOption, roleTarget?.role === role && s.roleOptionActive, submitting && s.disabled]}
                  disabled={submitting || roleTarget?.role === role}
                  onPress={() => handleRoleChange(role)}
                >
                  <View style={[s.roleColorDot, { backgroundColor: ROLE_COLOR[role] }]} />
                  <Text style={[s.roleOptionText, roleTarget?.role === role && s.roleOptionTextActive]}>{role.replace('_', ' ')}</Text>
                  {roleTarget?.role === role && <Text style={s.currentTag}>current</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setRoleTarget(null)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPH: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  email: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  changeBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  changeBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  currentRole: { fontSize: 13, color: '#374151', marginBottom: 16 },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  roleOptionActive: { opacity: 0.5 },
  roleColorDot: { width: 10, height: 10, borderRadius: 5 },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: '#030712', textTransform: 'capitalize', flex: 1 },
  roleOptionTextActive: { color: '#9ca3af' },
  currentTag: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic' },
  cancelBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  disabled: { opacity: 0.5 },
});
