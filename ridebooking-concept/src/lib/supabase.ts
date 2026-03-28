import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'super_admin' | 'admin' | 'rider' | 'user';
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

export async function getRiderProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'rider')
    .order('created_at', { ascending: false });
  return (data as Profile[]) || [];
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
