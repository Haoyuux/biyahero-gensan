import { supabase } from './supabase';

export interface MaintenanceSettings {
  id: number;
  mode: 'off' | 'half' | 'full';
  message: string | null;
  marquee_message: string | null;
  immediate: boolean;
  reg_user_disabled: boolean;
  reg_rider_disabled: boolean;
  updated_at: string;
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
  updates: Partial<Omit<MaintenanceSettings, 'id' | 'updated_at'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('maintenance')
    .update(updates)
    .eq('id', 1);
  if (error) { console.error('updateMaintenanceSettings:', error); return false; }
  return true;
}
