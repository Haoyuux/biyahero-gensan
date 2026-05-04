import { supabase, supabaseAdmin } from './supabase';

export interface AppSettings {
  id: number;
  app_name: string;
  document_title: string | null;
  app_logo_url: string | null;
  remittance_qr_url: string | null;
  remittance_enabled: boolean;
  updated_at: string;
}

export async function getAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching app settings:', error);
    return null;
  }
  return data;
}

export async function updateAppSettings(settings: Partial<AppSettings>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    console.error('Error updating app settings:', error);
    return false;
  }
  return true;
}

export async function uploadSettingImage(file: File, folder: 'logos' | 'qrs'): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}.${ext}`;
  
  const { error } = await supabaseAdmin.storage
    .from('documents')
    .upload(path, file, { upsert: true });

  if (error) {
    console.error(`Error uploading ${folder}:`, error);
    return null;
  }

  const { data } = supabaseAdmin.storage.from('documents').getPublicUrl(path);
  return data.publicUrl;
}
