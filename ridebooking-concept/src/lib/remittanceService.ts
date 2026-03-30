// ─── Remittance Service ──────────────────────────────────────────────────────
// Handles rider remittance (booking fee collection & receipt uploads).

import { supabase, supabaseAdmin } from './supabase';

export interface Remittance {
  id: string;
  rider_id: string;
  rider_name: string | null;
  rider_avatar: string | null;
  remittance_date: string;
  total_earnings: number;
  total_booking_fee: number;
  amount_remitted: number;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  rides_count: number;
}

/** Fetch rider's own remittances, optionally filtered by date. */
export async function getRiderRemittances(
  riderId: string,
  dateFilter?: string, // YYYY-MM-DD
): Promise<Remittance[]> {
  let query = supabase
    .from('remittances')
    .select('*')
    .eq('rider_id', riderId)
    .order('remittance_date', { ascending: false });

  if (dateFilter) {
    query = query.eq('remittance_date', dateFilter);
  }

  const { data } = await query;
  return (data as Remittance[]) || [];
}

/** Fetch all remittances (admin). */
export async function getAllRemittances(
  statusFilter?: string,
): Promise<Remittance[]> {
  let query = supabase
    .from('remittances')
    .select('*')
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data } = await query;
  return (data as Remittance[]) || [];
}

/** Get rider's completed rides for a specific date (to compute daily earnings). */
export async function getRiderDailyStats(
  riderId: string,
  date: string, // YYYY-MM-DD
): Promise<{ rides: any[]; totalEarnings: number; totalBookingFee: number; ridesCount: number }> {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data } = await supabase
    .from('rides')
    .select('id, fare, fare_breakdown, completed_at')
    .eq('rider_id', riderId)
    .eq('status', 'completed')
    .gte('completed_at', dayStart)
    .lte('completed_at', dayEnd)
    .order('completed_at', { ascending: false });

  const rides = data ?? [];
  const totalEarnings = rides.reduce((sum, r) => sum + (r.fare || 0), 0);
  const totalBookingFee = rides.reduce((sum, r) => {
    const fb = r.fare_breakdown;
    return sum + (fb?.bookingFee || 0);
  }, 0);

  return {
    rides,
    totalEarnings,
    totalBookingFee,
    ridesCount: rides.length,
  };
}

/** Upload a receipt image for a remittance. */
export async function uploadReceipt(
  riderId: string,
  file: File,
): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `remittances/${riderId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from('documents').getPublicUrl(path);
  return data.publicUrl;
}

/** Create a new remittance entry. */
export async function createRemittance(
  riderId: string,
  riderName: string,
  riderAvatar: string | null,
  date: string,
  totalEarnings: number,
  totalBookingFee: number,
  amountRemitted: number,
  receiptUrl: string,
  ridesCount: number,
): Promise<Remittance | null> {
  const { data, error } = await supabaseAdmin
    .from('remittances')
    .insert({
      rider_id: riderId,
      rider_name: riderName,
      rider_avatar: riderAvatar,
      remittance_date: date,
      total_earnings: totalEarnings,
      total_booking_fee: totalBookingFee,
      amount_remitted: amountRemitted,
      receipt_url: receiptUrl,
      rides_count: ridesCount,
      status: 'pending',
    })
    .select()
    .single();
  if (error) return null;
  return data as Remittance;
}

/** Admin: approve or reject a remittance. */
export async function reviewRemittance(
  remittanceId: string,
  status: 'approved' | 'rejected',
  adminNotes: string,
  reviewerName: string,
): Promise<Remittance | null> {
  const { data, error } = await supabaseAdmin
    .from('remittances')
    .update({
      status,
      admin_notes: adminNotes || null,
      reviewed_by: reviewerName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', remittanceId)
    .select()
    .single();
  if (error) return null;
  return data as Remittance;
}

/** Check if rider has any pending (unreviewed) remittance. */
export async function hasPendingRemittance(riderId: string): Promise<boolean> {
  const { count } = await supabase
    .from('remittances')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('status', 'pending');
  return (count ?? 0) > 0;
}
