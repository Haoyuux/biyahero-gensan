// ─── Maintenance Service ───────────────────────────────────────────────────────

import { supabase, supabaseAdmin } from './supabase';

export type MaintenanceMode = 'off' | 'half' | 'full';

export interface MaintenanceSettings {
  id: number;
  mode: MaintenanceMode;
  message: string | null;
  marquee_message: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  post_news: boolean;
  auto_news_post_id: string | null;
  reg_user_disabled: boolean;
  reg_rider_disabled: boolean;
  updated_at: string;
}

export function getEffectiveMode(s: MaintenanceSettings | null): MaintenanceMode {
  if (!s || s.mode === 'off') return 'off';
  const now = new Date();
  if (s.scheduled_start && now < new Date(s.scheduled_start)) return 'off';
  if (s.scheduled_end && now >= new Date(s.scheduled_end)) return 'off';
  return s.mode;
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings | null> {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) { console.error('getMaintenanceSettings:', error); return null; }
  return data as MaintenanceSettings;
}

export async function updateMaintenanceSettings(
  settings: Partial<Omit<MaintenanceSettings, 'id' | 'updated_at'>>,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('maintenance')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) { console.error('updateMaintenanceSettings:', error); return false; }
  return true;
}

export function subscribeToMaintenance(
  cb: (s: MaintenanceSettings) => void,
): () => void {
  const channel = supabase
    .channel(`maintenance-changes-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'maintenance', filter: 'id=eq.1' },
      (payload) => { if (payload.new) cb(payload.new as MaintenanceSettings); },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
