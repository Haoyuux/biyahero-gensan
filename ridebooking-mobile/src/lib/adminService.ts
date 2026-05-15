import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

async function callAdminFn(name: string, body: object): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Admin operation failed');
  }
}

export const verifyRider = (
  riderId: string,
  status: 'approved' | 'rejected' | 'pending',
) => callAdminFn('admin-verify-rider', { riderId, status });

export const reviewRemittance = (
  id: string,
  status: 'approved' | 'rejected',
  notes?: string,
) => callAdminFn('admin-review-remittance', { id, status, notes });

export const blockUser = (
  userId: string,
  reason: string,
  blockedByName: string,
) => callAdminFn('admin-block-user', { action: 'block', userId, reason, blockedByName });

export const unblockUser = (userId: string) =>
  callAdminFn('admin-block-user', { action: 'unblock', userId });
