import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

export const supabaseAdmin = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export type UserRole = 'super_admin' | 'admin' | 'team_leader' | 'rider' | 'user';
export type RiderStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_photo_url: string | null;
  role: UserRole;
  onboarded: boolean;
  profile_completed: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birthday: string | null;
  sex: string | null;
  // Rider-specific
  vehicle_type: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  drivers_license_url: string | null;
  or_url: string | null;
  cr_url: string | null;
  vehicle_image_url: string | null;
  rider_status: RiderStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  admin_role_id: string | null;
  admin_role_ids: string[];
  // Presence (online status + GPS)
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  // Blocking
  is_blocked: boolean;
  block_reason: string | null;
  blocked_by: string | null;
  blocked_at: string | null;
  created_at: string;
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) return null;
  return data as Profile;
}

export async function setRiderStatus(targetUserId: string, status: RiderStatus): Promise<boolean> {
  const { error } = await supabase.rpc('set_rider_status', {
    target_user_id: targetUserId,
    new_status: status,
  });
  return !error;
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  created_at: string;
}

export async function getAdminRoles(): Promise<AdminRole[]> {
  const { data } = await supabase.from('admin_roles').select('*').order('created_at', { ascending: true });
  return (data as AdminRole[]) || [];
}

export async function createAdminRole(name: string, description: string, modules: string[]): Promise<AdminRole | null> {
  const { data, error } = await supabase.from('admin_roles').insert({ name, description, modules }).select().single();
  if (error) return null;
  return data as AdminRole;
}

export async function updateAdminRole(id: string, updates: Partial<Pick<AdminRole, 'name' | 'description' | 'modules'>>): Promise<AdminRole | null> {
  const { data, error } = await supabase.from('admin_roles').update(updates).eq('id', id).select().single();
  if (error) return null;
  return data as AdminRole;
}

export async function deleteAdminRole(id: string): Promise<boolean> {
  const { error } = await supabase.from('admin_roles').delete().eq('id', id);
  return !error;
}

export async function assignAdminRoles(userId: string, roleIds: string[]): Promise<boolean> {
  const { error } = await supabase.rpc('assign_admin_roles', {
    target_user_id: userId,
    role_ids: roleIds,
  });
  return !error;
}

export async function getRiderProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'rider')
    .order('created_at', { ascending: false });
  return (data as Profile[]) || [];
}

// ── Blocking ──────────────────────────────────────────────────────────────────

export async function getBlockableProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['user', 'rider'])
    .order('created_at', { ascending: false });
  return (data as Profile[]) || [];
}

export async function blockUser(
  targetUserId: string,
  reason: string,
  blockedByName: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      is_blocked: true,
      block_reason: reason,
      blocked_by: blockedByName,
      blocked_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)
    .select()
    .single();
  if (error) return null;
  return data as Profile;
}

export async function unblockUser(targetUserId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      is_blocked: false,
      block_reason: null,
      blocked_by: null,
      blocked_at: null,
    })
    .eq('id', targetUserId)
    .select()
    .single();
  if (error) return null;
  return data as Profile;
}

export async function uploadImage(
  bucket: 'avatars' | 'covers' | 'documents',
  userId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
