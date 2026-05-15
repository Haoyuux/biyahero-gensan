import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Alert, TextInput, Switch,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Voucher } from '../../lib/voucherService';

interface VoucherForm {
  code: string;
  title: string;
  description: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: string;
  max_discount_amount: string;
  minimum_fare: string;
  usage_limit: string;
  per_user_limit: string;
  is_active: boolean;
}

const EMPTY_FORM: VoucherForm = {
  code: '', title: '', description: '', discount_type: 'fixed',
  discount_value: '0', max_discount_amount: '', minimum_fare: '0',
  usage_limit: '', per_user_limit: '1', is_active: true,
};

export default function VouchersScreen() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<VoucherForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false });
    setVouchers((data ?? []) as Voucher[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };

  const openEdit = (v: Voucher) => {
    setForm({
      code: v.code, title: v.title, description: v.description ?? '',
      discount_type: v.discount_type, discount_value: String(v.discount_value),
      max_discount_amount: v.max_discount_amount != null ? String(v.max_discount_amount) : '',
      minimum_fare: String(v.minimum_fare), usage_limit: v.usage_limit != null ? String(v.usage_limit) : '',
      per_user_limit: String(v.per_user_limit), is_active: v.is_active,
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const saveVoucher = async () => {
    if (!form.code.trim() || !form.title.trim()) { Alert.alert('Required', 'Code and title are required.'); return; }
    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value) || 0,
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : null,
        minimum_fare: parseFloat(form.minimum_fare) || 0,
        usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
        per_user_limit: parseInt(form.per_user_limit) || 1,
        is_active: form.is_active,
      };
      if (editingId) {
        const { error } = await supabase.from('vouchers').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vouchers').insert(payload);
        if (error) throw error;
      }
      setShowForm(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const toggleActive = async (v: Voucher) => {
    try { await supabase.from('vouchers').update({ is_active: !v.is_active }).eq('id', v.id); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteVoucher = (v: Voucher) => {
    Alert.alert('Delete Voucher', `Delete code "${v.code}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await supabase.from('vouchers').delete().eq('id', v.id); await load(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Vouchers</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}><Text style={s.addBtnText}>+ Create</Text></TouchableOpacity>
      </View>
      <FlatList
        data={vouchers}
        keyExtractor={v => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={[s.card, !item.is_active && s.cardInactive]}>
            <View style={s.cardHeader}>
              <Text style={s.code}>{item.code}</Text>
              <View style={s.headerRight}>
                <Switch value={item.is_active} onValueChange={() => toggleActive(item)} trackColor={{ true: '#10b981' }} style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }} />
              </View>
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.discount}>
              {item.discount_type === 'fixed' ? `₱${item.discount_value} off` : `${item.discount_value}% off`}
              {item.max_discount_amount ? ` (max ₱${item.max_discount_amount})` : ''}
            </Text>
            <View style={s.meta}>
              <Text style={s.metaText}>Min fare: ₱{item.minimum_fare}</Text>
              <Text style={s.metaText}>Limit: {item.usage_limit ?? '∞'} total / {item.per_user_limit}x per user</Text>
            </View>
            <View style={s.cardFooter}>
              <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}><Text style={s.editBtnText}>Edit</Text></TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={() => deleteVoucher(item)}><Text style={s.deleteBtnText}>Delete</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No vouchers yet</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Voucher' : 'New Voucher'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            {([
              { key: 'code', label: 'Code *', placeholder: 'SUMMER20' },
              { key: 'title', label: 'Title *', placeholder: 'Summer Promo' },
              { key: 'description', label: 'Description', placeholder: 'Optional description' },
            ] as { key: keyof VoucherForm; label: string; placeholder: string }[]).map(field => (
              <View key={field.key}>
                <Text style={s.fieldLabel}>{field.label}</Text>
                <TextInput
                  style={s.input}
                  value={form[field.key] as string}
                  onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize={field.key === 'code' ? 'characters' : 'sentences'}
                />
              </View>
            ))}

            <Text style={s.fieldLabel}>Discount Type</Text>
            <View style={s.typeRow}>
              {(['fixed', 'percentage'] as const).map(t => (
                <TouchableOpacity key={t} style={[s.typeBtn, form.discount_type === t && s.typeBtnActive]} onPress={() => setForm(f => ({ ...f, discount_type: t }))}>
                  <Text style={[s.typeBtnText, form.discount_type === t && s.typeBtnTextActive]}>{t === 'fixed' ? '₱ Fixed' : '% Percentage'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {([
              { key: 'discount_value', label: `Discount Value (${form.discount_type === 'fixed' ? '₱' : '%'})` },
              { key: 'max_discount_amount', label: 'Max Discount (₱, optional)' },
              { key: 'minimum_fare', label: 'Minimum Fare (₱)' },
              { key: 'usage_limit', label: 'Total Usage Limit (blank = unlimited)' },
              { key: 'per_user_limit', label: 'Per User Limit' },
            ] as { key: keyof VoucherForm; label: string }[]).map(field => (
              <View key={field.key}>
                <Text style={s.fieldLabel}>{field.label}</Text>
                <TextInput
                  style={s.input}
                  value={form[field.key] as string}
                  onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            ))}

            <View style={s.toggleRow}>
              <Text style={s.fieldLabel}>Active</Text>
              <Switch value={form.is_active} onValueChange={v => setForm(f => ({ ...f, is_active: v }))} trackColor={{ true: '#10b981' }} />
            </View>

            <TouchableOpacity style={[s.saveBtn, submitting && s.disabled]} disabled={submitting} onPress={saveVoucher}>
              <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Create Voucher'}</Text>
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
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 15, fontWeight: '800', color: '#030712', fontFamily: 'monospace', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  discount: { fontSize: 13, color: '#10b981', fontWeight: '600', marginBottom: 6 },
  meta: { gap: 2, marginBottom: 10 },
  metaText: { fontSize: 11, color: '#9ca3af' },
  cardFooter: { flexDirection: 'row', gap: 8 },
  editBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  typeBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  typeBtnTextActive: { color: '#10b981' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
