import { supabase, supabaseAdmin } from './supabase';
import type { FareBreakdown } from './fareService';

export type VoucherDiscountType = 'percentage' | 'fixed';
export type UserVoucherStatus = 'available' | 'used' | 'expired';

export interface Voucher {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discount_type: VoucherDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  minimum_fare: number;
  minimum_distance_km: number;
  usage_limit: number | null;
  per_user_limit: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserVoucher {
  id: string;
  user_id: string;
  voucher_id: string;
  code: string;
  status: UserVoucherStatus;
  added_at: string;
  used_at: string | null;
  ride_id: string | null;
  voucher?: Voucher;
}

export interface VoucherQuote {
  voucher: Voucher;
  discount: number;
  finalFare: number;
  reason?: string;
}

export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function isVoucherInWindow(voucher: Voucher, now = new Date()): boolean {
  if (!voucher.is_active) return false;
  if (voucher.starts_at && now < new Date(voucher.starts_at)) return false;
  if (voucher.expires_at && now > new Date(voucher.expires_at)) return false;
  return true;
}

export function calculateVoucherDiscount(voucher: Voucher, fare: number): number {
  const raw =
    voucher.discount_type === 'percentage'
      ? fare * (voucher.discount_value / 100)
      : voucher.discount_value;
  const capped =
    voucher.discount_type === 'percentage' && voucher.max_discount_amount != null
      ? Math.min(raw, voucher.max_discount_amount)
      : raw;
  return Math.max(0, Math.min(fare, Math.round(capped)));
}

export function getVoucherRideIssue(
  voucher: Voucher,
  fare: number,
  distanceKm: number,
): string | null {
  if (!isVoucherInWindow(voucher)) {
    if (!voucher.is_active) return 'Voucher is inactive';
    if (voucher.starts_at && new Date() < new Date(voucher.starts_at)) return 'Voucher is not active yet';
    return 'Voucher is expired';
  }
  if (voucher.minimum_fare > fare) return `Requires minimum fare of ₱${voucher.minimum_fare}`;
  if (voucher.minimum_distance_km > distanceKm) return `Requires ${voucher.minimum_distance_km} km or more`;
  return null;
}

export function quoteVoucher(
  voucher: Voucher,
  breakdown: FareBreakdown,
): VoucherQuote {
  const reason = getVoucherRideIssue(voucher, breakdown.totalFare, breakdown.distanceKm);
  const discount = reason ? 0 : calculateVoucherDiscount(voucher, breakdown.totalFare);
  return {
    voucher,
    discount,
    finalFare: Math.max(0, breakdown.totalFare - discount),
    reason: reason ?? undefined,
  };
}

export async function fetchVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchVouchers:', error);
    return [];
  }
  return (data as Voucher[]) || [];
}

export async function createVoucher(
  input: Omit<Voucher, 'id' | 'created_at' | 'updated_at'>,
): Promise<Voucher | null> {
  const { data, error } = await supabaseAdmin
    .from('vouchers')
    .insert({ ...input, code: normalizeVoucherCode(input.code) })
    .select()
    .single();
  if (error) {
    console.error('createVoucher:', error);
    return null;
  }
  return data as Voucher;
}

export async function updateVoucher(
  id: string,
  updates: Partial<Omit<Voucher, 'id' | 'created_at'>>,
): Promise<Voucher | null> {
  const payload = {
    ...updates,
    ...(updates.code ? { code: normalizeVoucherCode(updates.code) } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from('vouchers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateVoucher:', error);
    return null;
  }
  return data as Voucher;
}

export async function fetchUserVouchers(userId: string): Promise<UserVoucher[]> {
  const { data, error } = await supabase
    .from('user_vouchers')
    .select('*, voucher:vouchers(*)')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) {
    console.error('fetchUserVouchers:', error);
    return [];
  }
  return (data as UserVoucher[]) || [];
}

async function getVoucherUsage(voucherId: string, userId: string) {
  const [{ count: totalUsed }, { count: userUsed }] = await Promise.all([
    supabase
      .from('user_vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('voucher_id', voucherId)
      .eq('status', 'used'),
    supabase
      .from('user_vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('voucher_id', voucherId)
      .eq('user_id', userId)
      .eq('status', 'used'),
  ]);
  return { totalUsed: totalUsed ?? 0, userUsed: userUsed ?? 0 };
}

export async function addVoucherToUser(
  userId: string,
  rawCode: string,
): Promise<{ userVoucher: UserVoucher | null; error?: string }> {
  const code = normalizeVoucherCode(rawCode);
  if (!code) return { userVoucher: null, error: 'Enter a voucher code' };

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error || !voucher) return { userVoucher: null, error: 'Voucher code not found' };

  const v = voucher as Voucher;
  if (!isVoucherInWindow(v)) return { userVoucher: null, error: 'Voucher is not available' };

  const usage = await getVoucherUsage(v.id, userId);
  if (v.usage_limit != null && usage.totalUsed >= v.usage_limit) {
    return { userVoucher: null, error: 'Voucher usage limit reached' };
  }
  if (usage.userUsed >= v.per_user_limit) {
    return { userVoucher: null, error: 'You already used this voucher' };
  }

  const { data: existing } = await supabase
    .from('user_vouchers')
    .select('*, voucher:vouchers(*)')
    .eq('user_id', userId)
    .eq('voucher_id', v.id)
    .eq('status', 'available')
    .maybeSingle();
  if (existing) return { userVoucher: existing as UserVoucher };

  const { data, error: insertError } = await supabase
    .from('user_vouchers')
    .insert({ user_id: userId, voucher_id: v.id, code: v.code, status: 'available' })
    .select('*, voucher:vouchers(*)')
    .single();
  if (insertError) {
    console.error('addVoucherToUser:', insertError);
    return { userVoucher: null, error: 'Unable to add voucher' };
  }
  return { userVoucher: data as UserVoucher };
}

export async function markVoucherUsed(
  userVoucherId: string,
  rideId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_vouchers')
    .update({ status: 'used', used_at: new Date().toISOString(), ride_id: rideId })
    .eq('id', userVoucherId);
  if (error) console.error('markVoucherUsed:', error);
  return !error;
}
