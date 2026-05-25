import { supabase } from './supabase';

export interface AppSettings {
  id: number;
  app_name: string;
  document_title: string | null;
  app_logo_url: string | null;
  remittance_qr_url: string | null;
  remittance_enabled: boolean;
  telegram_enabled: boolean;
  maintenance_mode: 'off' | 'half' | 'full';
  maintenance_message: string | null;
  updated_at: string;
}

export async function getAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) { console.error('getAppSettings:', error); return null; }
  return data as AppSettings;
}

export async function updateAppSettings(updates: Partial<Omit<AppSettings, 'id' | 'updated_at'>>): Promise<boolean> {
  const { error } = await supabase
    .from('app_settings')
    .update(updates)
    .eq('id', 1);
  if (error) { console.error('updateAppSettings:', error); return false; }
  return true;
}

export async function uploadSettingImage(uri: string, folder: 'logos' | 'qrs'): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `settings-${folder}-${Date.now()}.${ext}`;
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
