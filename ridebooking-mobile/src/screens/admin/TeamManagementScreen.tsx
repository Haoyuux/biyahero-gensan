import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Alert, TextInput, Switch,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { Team, TeamMember } from '../../lib/teamService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type TeamWithCount = Team & { member_count: number };

interface TeamForm {
  name: string;
  capacity: string;
  schedule_days: number[];
  is_active: boolean;
}

const DEFAULT_FORM: TeamForm = { name: '', capacity: '10', schedule_days: [1,2,3,4,5], is_active: true };

export default function TeamManagementScreen() {
  const [teams, setTeams] = useState<TeamWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [availableRiders, setAvailableRiders] = useState<Profile[]>([]);
  const [form, setForm] = useState<TeamForm>(DEFAULT_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, member_count:team_members(count)')
      .order('name');
    setTeams((data ?? []).map((t: any) => ({
      ...t,
      member_count: t.member_count?.[0]?.count ?? 0,
    })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTeam = async (team: Team) => {
    const { data: members } = await supabase
      .from('team_members')
      .select(`id, team_id, rider_id, joined_at, rider:profiles!team_members_rider_id_fkey(id, full_name, avatar_url, is_online, rider_status)`)
      .eq('team_id', team.id);
    setTeamMembers((members ?? []) as unknown as TeamMember[]);

    const { data: riders } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['rider', 'team_leader'])
      .eq('rider_status', 'approved');
    setAvailableRiders((riders ?? []) as Profile[]);
    setSelectedTeam(team);
  };

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (team: Team) => {
    setForm({ name: team.name, capacity: String(team.capacity), schedule_days: team.schedule_days, is_active: team.is_active });
    setEditingId(team.id);
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Team name is required.'); return; }
    setSubmitting(true);
    try {
      const payload = { name: form.name.trim(), capacity: parseInt(form.capacity) || 10, schedule_days: form.schedule_days, is_active: form.is_active };
      if (editingId) {
        const { error } = await supabase.from('teams').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teams').insert({ ...payload, leader_id: null });
        if (error) throw error;
      }
      setShowForm(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const deleteTeam = (team: Team) => {
    Alert.alert('Delete Team', `Delete "${team.name}"? This will remove all members.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('team_members').delete().eq('team_id', team.id);
            await supabase.from('teams').delete().eq('id', team.id);
            await load();
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const addMember = async (riderId: string) => {
    if (!selectedTeam) return;
    const already = teamMembers.some(m => m.rider_id === riderId);
    if (already) { Alert.alert('Already a member'); return; }
    try {
      await supabase.from('team_members').insert({ team_id: selectedTeam.id, rider_id: riderId });
      await openTeam(selectedTeam);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedTeam) return;
    try {
      await supabase.from('team_members').delete().eq('id', memberId);
      await openTeam(selectedTeam);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      schedule_days: f.schedule_days.includes(day)
        ? f.schedule_days.filter(d => d !== day)
        : [...f.schedule_days, day].sort(),
    }));
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  const unassignedRiders = availableRiders.filter(r =>
    !teamMembers.some(m => m.rider_id === r.id) &&
    (!memberSearch || (r.full_name ?? '').toLowerCase().includes(memberSearch.toLowerCase())),
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Team Management</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Text style={s.addBtnText}>+ New Team</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={teams}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <View style={s.cardTitleRow}>
                  <Text style={s.teamName}>{item.name}</Text>
                  <View style={[s.activeBadge, !item.is_active && s.inactiveBadge]}>
                    <Text style={[s.activeBadgeText, !item.is_active && s.inactiveBadgeText]}>{item.is_active ? 'Active' : 'Inactive'}</Text>
                  </View>
                </View>
                <Text style={s.sub}>{item.member_count} members · Cap {item.capacity}</Text>
                <Text style={s.days}>{item.schedule_days.map(d => DAYS[d]).join(', ')}</Text>
              </View>
              <View style={s.cardBtns}>
                <TouchableOpacity style={s.viewBtn} onPress={() => openTeam(item)}><Text style={s.viewBtnText}>Members</Text></TouchableOpacity>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}><Text style={s.editBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => deleteTeam(item)}><Text style={s.deleteBtnText}>Del</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No teams yet. Create one!</Text>}
        contentContainerStyle={s.list}
      />

      {/* Team Detail Modal */}
      <Modal visible={!!selectedTeam && !showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedTeam(null)}>
        {selectedTeam && (
          <SafeAreaView style={s.safe}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{selectedTeam.name}</Text>
              <TouchableOpacity onPress={() => setSelectedTeam(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalContent}>
              <Text style={s.sectionLabel}>MEMBERS ({teamMembers.length})</Text>
              {teamMembers.map(m => (
                <View key={m.id} style={s.memberRow}>
                  <Text style={s.memberName}>{m.rider?.full_name ?? m.rider_id.slice(0, 8)}</Text>
                  <TouchableOpacity style={s.removeBtn} onPress={() => removeMember(m.id)}>
                    <Text style={s.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={s.sectionLabel}>ADD MEMBER</Text>
              <TextInput
                style={s.search}
                placeholder="Search riders…"
                placeholderTextColor="#9ca3af"
                value={memberSearch}
                onChangeText={setMemberSearch}
              />
              {unassignedRiders.slice(0, 20).map(r => (
                <TouchableOpacity key={r.id} style={s.addMemberRow} onPress={() => addMember(r.id)}>
                  <Text style={s.memberName}>{r.full_name ?? r.email}</Text>
                  <Text style={s.addMemberBtn}>+ Add</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Create/Edit Form Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Team' : 'New Team'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.fieldLabel}>Team Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Enter team name" placeholderTextColor="#9ca3af" />

            <Text style={s.fieldLabel}>Capacity</Text>
            <TextInput style={s.input} value={form.capacity} onChangeText={v => setForm(f => ({ ...f, capacity: v }))} keyboardType="numeric" placeholder="10" placeholderTextColor="#9ca3af" />

            <Text style={s.fieldLabel}>Schedule Days</Text>
            <View style={s.daysRow}>
              {DAYS.map((day, i) => (
                <TouchableOpacity key={i} style={[s.dayBtn, form.schedule_days.includes(i) && s.dayBtnActive]} onPress={() => toggleDay(i)}>
                  <Text style={[s.dayBtnText, form.schedule_days.includes(i) && s.dayBtnTextActive]}>{day.slice(0, 2)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.toggleRow}>
              <Text style={s.fieldLabel}>Active</Text>
              <Switch value={form.is_active} onValueChange={v => setForm(f => ({ ...f, is_active: v }))} trackColor={{ true: '#10b981' }} />
            </View>

            <TouchableOpacity style={[s.saveBtn, submitting && s.disabled]} disabled={submitting} onPress={saveForm}>
              <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Create Team'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712' },
  addBtn: { backgroundColor: '#030712', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamName: { fontSize: 15, fontWeight: '700', color: '#030712' },
  activeBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  inactiveBadge: { backgroundColor: '#f3f4f6' },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  inactiveBadgeText: { color: '#9ca3af' },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  days: { fontSize: 11, color: '#9ca3af' },
  cardBtns: { gap: 6 },
  viewBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  viewBtnText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  editBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  editBtnText: { fontSize: 11, fontWeight: '600', color: '#3b82f6' },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  deleteBtnText: { fontSize: 11, fontWeight: '600', color: '#ef4444' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  memberName: { fontSize: 14, fontWeight: '600', color: '#030712' },
  removeBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  removeBtnText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 10 },
  addMemberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  addMemberBtn: { fontSize: 13, fontWeight: '700', color: '#10b981' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  daysRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dayBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  dayBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  dayBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  dayBtnTextActive: { color: '#10b981' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
