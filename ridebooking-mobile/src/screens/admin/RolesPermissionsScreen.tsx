import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Alert, TextInput,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { createAdminRole, updateAdminRole, deleteAdminRole } from '../../lib/adminService';
import { useProfile } from '../../contexts/AuthContext';

interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  created_at: string;
}

const ALL_MODULES = [
  { id: 'live', label: 'Live Operations' },
  { id: 'drivers', label: 'Driver Management' },
  { id: 'riders', label: 'Rider Verification' },
  { id: 'teams', label: 'Team Management' },
  { id: 'news', label: 'News Feed' },
  { id: 'analytics', label: 'Booking Analytics' },
  { id: 'finances', label: 'Revenue Dashboard' },
  { id: 'reviews', label: 'Ride Reviews' },
  { id: 'remittances', label: 'Remittances' },
  { id: 'users', label: 'User Management' },
  { id: 'pricing', label: 'Pricing Config' },
  { id: 'blocking', label: 'User Blocking' },
  { id: 'settings', label: 'App Settings' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'vouchers', label: 'Vouchers' },
];

interface RoleForm { name: string; description: string; modules: string[]; }
const EMPTY_FORM: RoleForm = { name: '', description: '', modules: [] };

export default function RolesPermissionsScreen() {
  const { profile } = useProfile();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('admin_roles').select('*').order('name');
    setRoles((data ?? []) as AdminRole[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (profile.role !== 'super_admin') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.restricted}>
          <Text style={s.restrictedIcon}>🔒</Text>
          <Text style={s.restrictedTitle}>Super Admin Only</Text>
          <Text style={s.restrictedSub}>Roles & Permissions management requires super_admin access.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const toggleModule = (moduleId: string) => {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(moduleId)
        ? f.modules.filter(m => m !== moduleId)
        : [...f.modules, moduleId],
    }));
  };

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (role: AdminRole) => {
    setForm({ name: role.name, description: role.description ?? '', modules: role.modules });
    setEditingId(role.id);
    setShowForm(true);
  };

  const saveRole = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Role name is required.'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateAdminRole(editingId, form.name.trim(), form.description.trim(), form.modules);
      } else {
        await createAdminRole(form.name.trim(), form.description.trim(), form.modules);
      }
      setShowForm(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const deleteRole = (role: AdminRole) => {
    Alert.alert('Delete Role', `Delete role "${role.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteAdminRole(role.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Roles & Permissions</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}><Text style={s.addBtnText}>+ Role</Text></TouchableOpacity>
      </View>
      <FlatList
        data={roles}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.roleName}>{item.name}</Text>
              <View style={s.cardBtns}>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}><Text style={s.editBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => deleteRole(item)}><Text style={s.deleteBtnText}>Del</Text></TouchableOpacity>
              </View>
            </View>
            {item.description && <Text style={s.roleDesc}>{item.description}</Text>}
            <View style={s.moduleChips}>
              {item.modules.slice(0, 5).map(m => (
                <View key={m} style={s.chip}><Text style={s.chipText}>{ALL_MODULES.find(mod => mod.id === m)?.label ?? m}</Text></View>
              ))}
              {item.modules.length > 5 && <View style={s.chip}><Text style={s.chipText}>+{item.modules.length - 5} more</Text></View>}
              {item.modules.length === 0 && <Text style={s.noModules}>No modules assigned</Text>}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No admin roles defined</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Role' : 'New Role'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.fieldLabel}>Role Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Operations Manager" placeholderTextColor="#9ca3af" />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput style={s.input} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Optional description" placeholderTextColor="#9ca3af" />

            <View style={s.modulesHeader}>
              <Text style={s.fieldLabel}>Modules ({form.modules.length} selected)</Text>
              <TouchableOpacity onPress={() => setForm(f => ({ ...f, modules: f.modules.length === ALL_MODULES.length ? [] : ALL_MODULES.map(m => m.id) }))}>
                <Text style={s.selectAllBtn}>{form.modules.length === ALL_MODULES.length ? 'Deselect All' : 'Select All'}</Text>
              </TouchableOpacity>
            </View>
            {ALL_MODULES.map(mod => (
              <TouchableOpacity key={mod.id} style={s.moduleRow} onPress={() => toggleModule(mod.id)}>
                <View style={[s.checkbox, form.modules.includes(mod.id) && s.checkboxActive]}>
                  {form.modules.includes(mod.id) && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.moduleLabel}>{mod.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[s.saveBtn, submitting && s.disabled]} disabled={submitting} onPress={saveRole}>
              <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Create Role'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  restrictedIcon: { fontSize: 48, marginBottom: 16 },
  restrictedTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 8 },
  restrictedSub: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712' },
  addBtn: { backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roleName: { fontSize: 15, fontWeight: '700', color: '#030712' },
  cardBtns: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  editBtnText: { fontSize: 11, fontWeight: '600', color: '#3b82f6' },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  deleteBtnText: { fontSize: 11, fontWeight: '600', color: '#ef4444' },
  roleDesc: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  moduleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  noModules: { fontSize: 11, color: '#d1d5db', fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  modulesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  selectAllBtn: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  checkmark: { fontSize: 12, color: '#fff', fontWeight: '700' },
  moduleLabel: { fontSize: 14, color: '#374151', flex: 1 },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
