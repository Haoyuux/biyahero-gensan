import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

async function callAdminFn(name: string, body: object): Promise<any> {
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
  return res.json();
}

// Phase 1 — Rider verification
export const verifyRider = (
  riderId: string,
  status: 'approved' | 'rejected' | 'pending',
) => callAdminFn('admin-verify-rider', { riderId, status });

// Phase 1 — Remittances
export const reviewRemittance = (
  id: string,
  status: 'approved' | 'rejected',
  notes?: string,
) => callAdminFn('admin-review-remittance', { id, status, notes });

// Phase 1 — User blocking
export const blockUser = (
  userId: string,
  reason: string,
  blockedByName: string,
) => callAdminFn('admin-block-user', { action: 'block', userId, reason, blockedByName });

export const unblockUser = (userId: string) =>
  callAdminFn('admin-block-user', { action: 'unblock', userId });

// Phase 2/5 — User role management
export const updateUserRole = (userId: string, role: string) =>
  callAdminFn('admin-update-user-role', { userId, role });

// Phase 5 — Admin role management (super_admin only)
export const createAdminRole = (name: string, description: string, modules: string[]) =>
  callAdminFn('admin-manage-admin-roles', { action: 'create', name, description, modules });

export const updateAdminRole = (id: string, name: string, description: string, modules: string[]) =>
  callAdminFn('admin-manage-admin-roles', { action: 'update', id, name, description, modules });

export const deleteAdminRole = (id: string) =>
  callAdminFn('admin-manage-admin-roles', { action: 'delete', id });

export const assignAdminRoles = (userId: string, roleIds: string[]) =>
  callAdminFn('admin-manage-admin-roles', { action: 'assign', userId, roleIds });
