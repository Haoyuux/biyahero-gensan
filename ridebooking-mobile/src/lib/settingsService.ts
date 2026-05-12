import { supabase } from './supabase';

export interface AppSettings {
  id: number;
  app_name: string;
  document_title: string | null;
  app_logo_url: string | null;
  remittance_qr_url: string | null;
  remittance_enabled: boolean;
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
