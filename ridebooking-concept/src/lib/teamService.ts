import { supabase, supabaseAdmin } from './supabase';
import type { Profile } from './supabase';

export interface Team {
  id: string;
  name: string;
  capacity: number;
  schedule_days: number[]; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  is_active: boolean;
  leader_id: string | null;
  created_by: string | null;
  created_at: string;
  leader?: Pick<Profile, 'id' | 'full_name' | 'first_name' | 'last_name' | 'avatar_url'> | null;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  rider_id: string;
  joined_at: string;
  rider?: Pick<Profile, 'id' | 'full_name' | 'first_name' | 'last_name' | 'avatar_url'>;
}

const TEAM_SELECT = 'id, name, capacity, schedule_days, is_active, leader_id, created_by, created_at, leader:profiles!teams_leader_id_fkey(id, full_name, first_name, last_name, avatar_url)';
const MEMBER_SELECT = 'id, team_id, rider_id, joined_at, rider:profiles!team_members_rider_id_fkey(id, full_name, first_name, last_name, avatar_url)';

export async function fetchTeams(): Promise<Team[]> {
  const { data } = await supabase.from('teams').select(TEAM_SELECT).order('created_at', { ascending: false });
  return (data as unknown as Team[]) ?? [];
}

export async function fetchTeamWithMembers(teamId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('id', teamId)
    .single();
  return (data as unknown as Team) ?? null;
}

export async function fetchMyTeam(leaderId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('leader_id', leaderId)
    .maybeSingle();
  return (data as unknown as Team) ?? null;
}

export async function createTeam(name: string, capacity: number, createdBy: string): Promise<Team | null> {
  const { data, error } = await supabase
    .from('teams').insert({ name, capacity, created_by: createdBy }).select(TEAM_SELECT).single();
  if (error) { console.error('createTeam:', error); return null; }
  return data as unknown as Team;
}

export async function updateTeam(id: string, updates: Partial<Pick<Team, 'name' | 'capacity' | 'leader_id' | 'schedule_days' | 'is_active'>>): Promise<boolean> {
  const { error } = await supabaseAdmin.from('teams').update(updates).eq('id', id);
  if (error) console.error('updateTeam:', error);
  return !error;
}

export async function deleteTeam(id: string): Promise<boolean> {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  return !error;
}

/** Fetch the team a rider belongs to as a member (not as leader). */
export async function fetchRiderMembership(riderId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('rider_id', riderId)
    .maybeSingle();
  if (!data?.team_id) return null;
  const { data: team } = await supabase
    .from('teams')
    .select(TEAM_SELECT)
    .eq('id', data.team_id)
    .maybeSingle();
  return (team as unknown as Team) ?? null;
}

export async function addTeamMember(teamId: string, riderId: string): Promise<boolean> {
  const { error } = await supabase.from('team_members').insert({ team_id: teamId, rider_id: riderId });
  if (error) console.error('addTeamMember:', error);
  return !error;
}

export async function removeTeamMember(teamId: string, riderId: string): Promise<boolean> {
  const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('rider_id', riderId);
  return !error;
}

export async function toggleTeamActive(teamId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin.from('teams').update({ is_active: isActive }).eq('id', teamId);
  if (error) console.error('toggleTeamActive:', error);
  return !error;
}
