import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Alert, TextInput, Switch, Image,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Voucher } from '../../lib/voucherService';
import { useProfile } from '../../contexts/AuthContext';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

async function fetchVoucherClaims(voucherId: string): Promise<{ uvRows: any[]; rideRows: any[]; profiles: any[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-fetch-voucher-claims`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ voucherId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? 'Failed to fetch claims');
  }
  return res.json();
}

interface VoucherWithUsage extends Voucher {
  usage_count: number;
}

interface UserVoucherRow {
  id: string;
  user_id: string;
  voucher_id: string;
  status: string; // raw DB value — 'claimed','available','used','expired', etc.
  added_at: string;
  used_at: string | null;
  ride_id: string | null;
  // joined
  user_name: string | null;
  user_avatar: string | null;
  ride_fare: number | null;
  ride_discount: number | null;
  ride_date: string | null;
  ride_pickup: string | null;
  voucher_discount_paid: boolean | null;
}

interface VoucherForm {
  code: string;
  title: string;
  description: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: string;
  max_discount_amount: string;
  minimum_fare: string;
  minimum_distance_km: string;
  usage_limit: string;
  per_user_limit: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

const EMPTY_FORM: VoucherForm = {
  code: '', title: '', description: '', discount_type: 'fixed',
  discount_value: '0', max_discount_amount: '', minimum_fare: '0',
  minimum_distance_km: '0', usage_limit: '', per_user_limit: '1',
  starts_at: '', expires_at: '', is_active: true,
};

function statusColor(s: string) {
  if (s === 'used') return '#6b7280';
  if (s === 'expired') return '#ef4444';
  return '#10b981'; // claimed / available / anything else
}
function statusLabel(s: string) {
  if (s === 'available') return 'Claimed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export default function VouchersScreen() {
  const { profile } = useProfile();
  const [vouchers, setVouchers] = useState<VoucherWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<VoucherForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // View (detail) state
  const [viewingVoucher, setViewingVoucher] = useState<VoucherWithUsage | null>(null);
  const [claimRows, setClaimRows] = useState<UserVoucherRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: voucherData } = await supabase
      .from('vouchers')
      .select('*')
      .order('created_at', { ascending: false });

    if (!voucherData?.length) {
      setVouchers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const ids = voucherData.map((v: any) => v.id);
    // Count from both user_vouchers (claims) and rides (direct usage) — take the higher
    const [{ data: uvData }, { data: rideData }] = await Promise.all([
      supabase.from('user_vouchers').select('voucher_id').in('voucher_id', ids),
      supabase.from('rides').select('voucher_id').in('voucher_id', ids),
    ]);

    const usageMap: Record<string, number> = {};
    // user_vouchers claims
    (uvData ?? []).forEach((u: any) => {
      usageMap[u.voucher_id] = (usageMap[u.voucher_id] ?? 0) + 1;
    });
    // rides — use whichever count is higher per voucher
    const rideMap: Record<string, number> = {};
    (rideData ?? []).forEach((u: any) => {
      rideMap[u.voucher_id] = (rideMap[u.voucher_id] ?? 0) + 1;
    });
    Object.keys(rideMap).forEach(id => {
      if ((rideMap[id] ?? 0) > (usageMap[id] ?? 0)) usageMap[id] = rideMap[id];
    });

    setVouchers(voucherData.map((v: any) => ({ ...v, usage_count: usageMap[v.id] ?? 0 })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load claims via Edge Function (uses service role — bypasses RLS)
  const openView = async (v: VoucherWithUsage) => {
    setViewingVoucher(v);
    setClaimsLoading(true);
    setClaimsError(null);
    setClaimRows([]);
    try {
      const { uvRows, rideRows, profiles } = await fetchVoucherClaims(v.id);

      const profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      profiles.forEach((p: any) => { profileMap[p.id] = p; });

      const rideMap: Record<string, any> = {};
      rideRows.forEach((r: any) => { rideMap[r.id] = r; });

      // user_vouchers rows (claimed/saved/used)
      const claimedRows: UserVoucherRow[] = uvRows.map((uv: any) => {
        const ride = uv.ride_id ? rideMap[uv.ride_id] : null;
        return {
          id: uv.id,
          user_id: uv.user_id,
          voucher_id: uv.voucher_id,
          status: uv.status,
          added_at: uv.added_at,
          used_at: uv.used_at,
          ride_id: uv.ride_id,
          user_name: profileMap[uv.user_id]?.full_name ?? null,
          user_avatar: profileMap[uv.user_id]?.avatar_url ?? null,
          ride_fare: ride?.fare ?? null,
          ride_discount: ride?.voucher_discount ?? null,
          ride_date: ride?.created_at ?? null,
          ride_pickup: ride?.pickup ?? null,
          voucher_discount_paid: ride?.voucher_discount_paid ?? null,
        };
      });

      // Rides that used the voucher without a user_vouchers row (applied directly at booking)
      const uvRideIds = new Set(uvRows.map((r: any) => r.ride_id).filter(Boolean));
      const extraRideRows: UserVoucherRow[] = rideRows
        .filter((r: any) => !uvRideIds.has(r.id))
        .map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          voucher_id: v.id,
          status: 'used',
          added_at: r.created_at,
          used_at: r.created_at,
          ride_id: r.id,
          user_name: profileMap[r.user_id]?.full_name ?? null,
          user_avatar: profileMap[r.user_id]?.avatar_url ?? null,
          ride_fare: r.fare,
          ride_discount: r.voucher_discount,
          ride_date: r.created_at,
          ride_pickup: r.pickup,
          voucher_discount_paid: r.voucher_discount_paid ?? null,
        }));

      setClaimRows([...claimedRows, ...extraRideRows]);
    } catch (e: any) {
      setClaimsError(e.message ?? 'Failed to load claims');
    }
    finally { setClaimsLoading(false); }
  };

  const handleRemoveClaim = async (row: UserVoucherRow) => {
    // Ride-sourced rows (extraRideRows) use the ride id as row.id — can't delete from user_vouchers
    // Only user_vouchers rows (claimed/not yet used) can be removed
    if (row.used_at !== null) {
      Alert.alert('Cannot Remove', 'This voucher was already used in a ride. Remove it from the ride record instead.');
      return;
    }
    Alert.alert('Remove Voucher', `Remove this saved voucher from ${row.user_name ?? 'user'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('user_vouchers').delete().eq('id', row.id);
            if (viewingVoucher) await openView(viewingVoucher);
            await load();
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const handleMarkPaid = async (row: UserVoucherRow) => {
    if (!row.ride_id) return;
    Alert.alert('Mark Paid', 'Mark this voucher discount as settled?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid', onPress: async () => {
          try {
            await supabase.from('rides').update({
              voucher_discount_paid: true,
              voucher_discount_paid_at: new Date().toISOString(),
              voucher_discount_paid_by: profile.id,
            }).eq('id', row.ride_id!);
            if (viewingVoucher) await openView(viewingVoucher);
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };

  const openEdit = (v: VoucherWithUsage) => {
    setForm({
      code: v.code, title: v.title, description: v.description ?? '',
      discount_type: v.discount_type, discount_value: String(v.discount_value),
      max_discount_amount: v.max_discount_amount != null ? String(v.max_discount_amount) : '',
      minimum_fare: String(v.minimum_fare ?? 0),
      minimum_distance_km: String(v.minimum_distance_km ?? 0),
      usage_limit: v.usage_limit != null ? String(v.usage_limit) : '',
      per_user_limit: String(v.per_user_limit ?? 1),
      starts_at: v.starts_at ?? '',
      expires_at: v.expires_at ?? '',
      is_active: v.is_active,
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const saveVoucher = async () => {
    const code = normalizeCode(form.code);
    if (!code || !form.title.trim()) { Alert.alert('Required', 'Code and title are required.'); return; }
    setSubmitting(true);
    try {
      const payload: any = {
        code,
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value) || 0,
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : null,
        minimum_fare: parseFloat(form.minimum_fare) || 0,
        minimum_distance_km: parseFloat(form.minimum_distance_km) || 0,
        usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
        per_user_limit: parseInt(form.per_user_limit) || 1,
        starts_at: form.starts_at.trim() || null,
        expires_at: form.expires_at.trim() || null,
        is_active: form.is_active,
      };
      if (!editingId) payload.created_by = profile.id;

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

  const toggleActive = async (v: VoucherWithUsage) => {
    try { await supabase.from('vouchers').update({ is_active: !v.is_active }).eq('id', v.id); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteVoucher = (v: VoucherWithUsage) => {
    Alert.alert('Delete Voucher', `Delete code "${v.code}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await supabase.from('vouchers').delete().eq('id', v.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
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
                <Text style={s.usageText}>{item.usage_count} / {item.usage_limit ?? '∞'} used</Text>
                <Switch
                  value={item.is_active}
                  onValueChange={() => toggleActive(item)}
                  trackColor={{ true: '#10b981' }}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
              </View>
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.discount}>
              {item.discount_type === 'fixed'
                ? `₱${item.discount_value} off`
                : `${item.discount_value}% off${item.max_discount_amount ? ` (max ₱${item.max_discount_amount})` : ''}`}
            </Text>
            <View style={s.metaGrid}>
              <Text style={s.metaItem}>Min fare: ₱{item.minimum_fare}</Text>
              <Text style={s.metaItem}>Min dist: {item.minimum_distance_km}km</Text>
              <Text style={s.metaItem}>Per user: {item.per_user_limit}x</Text>
              {item.expires_at && <Text style={s.metaItem}>Expires: {new Date(item.expires_at).toLocaleDateString()}</Text>}
            </View>
            <View style={s.cardFooter}>
              <TouchableOpacity style={s.viewBtn} onPress={() => openView(item)}>
                <Text style={s.viewBtnText}>View Claims</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}><Text style={s.editBtnText}>Edit</Text></TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={() => deleteVoucher(item)}><Text style={s.deleteBtnText}>Delete</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No vouchers yet</Text>}
        contentContainerStyle={s.list}
      />

      {/* ── View / Claims Modal ── */}
      <Modal visible={!!viewingVoucher} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewingVoucher(null)}>
        {viewingVoucher && (
          <SafeAreaView style={s.safe}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{viewingVoucher.code}</Text>
                <Text style={s.modalSub}>{viewingVoucher.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewingVoucher(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
            </View>

            {/* Voucher summary */}
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryNum}>{viewingVoucher.usage_count}</Text>
                <Text style={s.summaryLabel}>Claims</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={s.summaryNum}>{viewingVoucher.usage_limit ?? '∞'}</Text>
                <Text style={s.summaryLabel}>Limit</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={[s.summaryNum, { color: viewingVoucher.is_active ? '#10b981' : '#ef4444' }]}>
                  {viewingVoucher.is_active ? 'Active' : 'Inactive'}
                </Text>
                <Text style={s.summaryLabel}>Status</Text>
              </View>
            </View>

            {claimsLoading
              ? <ActivityIndicator style={{ flex: 1 }} color="#10b981" />
              : claimsError
              ? (
                <ScrollView contentContainerStyle={s.claimsList}>
                  <View style={s.errorBox}>
                    <Text style={s.errorTitle}>Failed to load claims</Text>
                    <Text style={s.errorMsg}>{claimsError}</Text>
                    <Text style={s.errorHint}>Make sure the Edge Function is deployed:{'\n'}supabase functions deploy admin-fetch-voucher-claims</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => viewingVoucher && openView(viewingVoucher)}>
                      <Text style={s.retryBtnText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )
              : (
                <ScrollView contentContainerStyle={s.claimsList}>
                  <Text style={s.sectionLabel}>
                    USAGE HISTORY ({claimRows.filter(r => r.used_at != null).length} used · {claimRows.filter(r => r.used_at == null).length} claimed)
                  </Text>
                  {claimRows.length === 0 && (
                    <Text style={s.empty}>No rides or saved claims for this voucher yet.</Text>
                  )}
                  {claimRows.map(row => (
                    <View key={row.id} style={s.claimCard}>
                      <View style={s.claimHeader}>
                        <View style={s.claimUser}>
                          {row.user_avatar
                            ? <Image source={{ uri: row.user_avatar }} style={s.claimAvatar} />
                            : <View style={s.claimAvatarPH}><Text style={s.claimAvatarInit}>{(row.user_name ?? '?')[0].toUpperCase()}</Text></View>
                          }
                          <View>
                            <Text style={s.claimName}>{row.user_name ?? 'Unknown User'}</Text>
                            <Text style={s.claimDate}>{new Date(row.added_at).toLocaleDateString()}</Text>
                          </View>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: statusColor(row.status) + '20' }]}>
                          <Text style={[s.statusText, { color: statusColor(row.status) }]}>{statusLabel(row.status)}</Text>
                        </View>
                      </View>

                      {row.status === 'used' && row.ride_fare != null && (
                        <View style={s.rideInfo}>
                          <Text style={s.rideInfoText}>
                            Fare: ₱{row.ride_fare.toFixed(2)} · Discount: ₱{(row.ride_discount ?? 0).toFixed(2)}
                          </Text>
                          {row.ride_pickup && <Text style={s.rideInfoText} numberOfLines={1}>{row.ride_pickup}</Text>}
                          {row.ride_date && <Text style={s.rideInfoDate}>{new Date(row.ride_date).toLocaleString()}</Text>}
                          {row.voucher_discount_paid
                            ? <View style={s.paidBadge}><Text style={s.paidBadgeText}>Discount Settled ✓</Text></View>
                            : (
                              <TouchableOpacity style={s.markPaidBtn} onPress={() => handleMarkPaid(row)}>
                                <Text style={s.markPaidBtnText}>Mark Discount as Settled</Text>
                              </TouchableOpacity>
                            )
                          }
                        </View>
                      )}

                      <TouchableOpacity style={s.removeClaimBtn} onPress={() => handleRemoveClaim(row)}>
                        <Text style={s.removeClaimBtnText}>Remove from user</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )
            }
          </SafeAreaView>
        )}
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Voucher' : 'New Voucher'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            <Field label="Code *">
              <TextInput style={s.input} value={form.code} onChangeText={v => setForm(f => ({ ...f, code: normalizeCode(v) }))} placeholder="SUMMER20" placeholderTextColor="#9ca3af" autoCapitalize="characters" />
            </Field>
            <Field label="Title *">
              <TextInput style={s.input} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="Summer Promo" placeholderTextColor="#9ca3af" />
            </Field>
            <Field label="Description">
              <TextInput style={s.input} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Optional" placeholderTextColor="#9ca3af" />
            </Field>

            <Field label="Discount Type">
              <View style={s.typeRow}>
                {(['fixed', 'percentage'] as const).map(t => (
                  <TouchableOpacity key={t} style={[s.typeBtn, form.discount_type === t && s.typeBtnActive]} onPress={() => setForm(f => ({ ...f, discount_type: t }))}>
                    <Text style={[s.typeBtnText, form.discount_type === t && s.typeBtnTextActive]}>{t === 'fixed' ? '₱ Fixed' : '% Percent'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label={`Discount Value (${form.discount_type === 'fixed' ? '₱' : '%'})`}>
              <TextInput style={s.input} value={form.discount_value} onChangeText={v => setForm(f => ({ ...f, discount_value: v }))} keyboardType="decimal-pad" />
            </Field>

            {form.discount_type === 'percentage' && (
              <Field label="Max Discount Amount (₱ cap, optional)">
                <TextInput style={s.input} value={form.max_discount_amount} onChangeText={v => setForm(f => ({ ...f, max_discount_amount: v }))} keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#9ca3af" />
              </Field>
            )}

            {([
              { key: 'minimum_fare', label: 'Minimum Fare (₱)' },
              { key: 'minimum_distance_km', label: 'Minimum Distance (km)' },
              { key: 'usage_limit', label: 'Total Usage Limit (blank = unlimited)' },
              { key: 'per_user_limit', label: 'Per User Limit' },
            ] as { key: keyof VoucherForm; label: string }[]).map(field => (
              <Field key={field.key} label={field.label}>
                <TextInput style={s.input} value={form[field.key] as string} onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))} keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
              </Field>
            ))}

            <Field label="Starts At (ISO datetime, optional)">
              <TextInput style={s.input} value={form.starts_at} onChangeText={v => setForm(f => ({ ...f, starts_at: v }))} placeholder="2025-06-01T00:00:00" placeholderTextColor="#9ca3af" autoCapitalize="none" />
            </Field>
            <Field label="Expires At (ISO datetime, optional)">
              <TextInput style={s.input} value={form.expires_at} onChangeText={v => setForm(f => ({ ...f, expires_at: v }))} placeholder="2025-12-31T23:59:59" placeholderTextColor="#9ca3af" autoCapitalize="none" />
            </Field>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
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
  cardInactive: { opacity: 0.55 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 16, fontWeight: '800', color: '#030712', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  usageText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  title: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  discount: { fontSize: 14, color: '#10b981', fontWeight: '700', marginBottom: 8 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  metaItem: { fontSize: 11, color: '#9ca3af', backgroundColor: '#f9fafb', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardFooter: { flexDirection: 'row', gap: 8 },
  viewBtn: { backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0' },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  editBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },

  // View modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#030712', letterSpacing: 0.5 },
  modalSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryNum: { fontSize: 22, fontWeight: '800', color: '#030712' },
  summaryLabel: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  claimsList: { padding: 16, paddingBottom: 40 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#fecaca', marginTop: 8 },
  errorTitle: { fontSize: 14, fontWeight: '700', color: '#ef4444', marginBottom: 6 },
  errorMsg: { fontSize: 13, color: '#7f1d1d', marginBottom: 8 },
  errorHint: { fontSize: 11, color: '#9ca3af', marginBottom: 12, fontFamily: 'monospace' },
  retryBtn: { backgroundColor: '#fff', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 12 },
  claimCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  claimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  claimUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  claimAvatar: { width: 36, height: 36, borderRadius: 18 },
  claimAvatarPH: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  claimAvatarInit: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  claimName: { fontSize: 14, fontWeight: '600', color: '#030712' },
  claimDate: { fontSize: 11, color: '#9ca3af' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  rideInfo: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 10 },
  rideInfoText: { fontSize: 13, color: '#374151', marginBottom: 2 },
  rideInfoDate: { fontSize: 11, color: '#9ca3af', marginBottom: 8 },
  paidBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
  paidBadgeText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  markPaidBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#10b981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignSelf: 'flex-start' },
  markPaidBtnText: { fontSize: 12, fontWeight: '600', color: '#10b981' },
  removeClaimBtn: { alignSelf: 'flex-start' },
  removeClaimBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  // Form
  formContent: { padding: 20, paddingBottom: 40 },
  fieldWrap: { marginTop: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 7 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  typeBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  typeBtnTextActive: { color: '#10b981' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
