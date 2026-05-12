import { supabase } from './supabase';

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

export async function getRiderRemittances(
  riderId: string,
  dateFilter?: string,
): Promise<Remittance[]> {
  let query = supabase
    .from('remittances')
    .select('*')
    .eq('rider_id', riderId)
    .order('remittance_date', { ascending: false });
  if (dateFilter) query = query.eq('remittance_date', dateFilter);
  const { data } = await query;
  return (data as Remittance[]) ?? [];
}

export async function getRiderDailyStats(
  riderId: string,
  date: string,
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
  const totalEarnings = rides.reduce((sum, r) => sum + (r.fare ?? 0), 0);
  const totalBookingFee = rides.reduce((sum, r) => sum + (r.fare_breakdown?.bookingFee ?? 0), 0);
  return { rides, totalEarnings, totalBookingFee, ridesCount: rides.length };
}

/** uri: local file URI from expo-image-picker (e.g. "file:///...") */
export async function uploadReceipt(riderId: string, uri: string): Promise<string | null> {
  try {
    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `remittances/${riderId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, blob, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
    if (error) { console.error('uploadReceipt:', error); return null; }
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error('uploadReceipt:', e);
    return null;
  }
}

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
  const { data, error } = await supabase
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
  if (error) { console.error('createRemittance:', error); return null; }
  return data as Remittance;
}

export async function getTeamRemittances(
  riderIds: string[],
  dateFilter?: string,
): Promise<Remittance[]> {
  if (!riderIds.length) return [];
  let query = supabase
    .from('remittances')
    .select('*')
    .in('rider_id', riderIds)
    .order('remittance_date', { ascending: false });
  if (dateFilter) query = query.eq('remittance_date', dateFilter);
  const { data } = await query;
  return (data as Remittance[]) ?? [];
}
