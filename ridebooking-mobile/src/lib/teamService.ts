import { supabase } from './supabase';

export interface TeamMember {
  id: string;
  team_id: string;
  rider_id: string;
  joined_at: string;
  rider?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
    rider_status: string | null;
  };
}

export interface Team {
  id: string;
  name: string;
  capacity: number;
  schedule_days: number[];
  is_active: boolean;
  leader_id: string | null;
  created_at: string;
  members?: TeamMember[];
}

const TEAM_SELECT = 'id, name, capacity, schedule_days, is_active, leader_id, created_at';
const MEMBER_SELECT = `id, team_id, rider_id, joined_at, rider:profiles!team_members_rider_id_fkey(id, full_name, first_name, last_name, avatar_url, is_online, rider_status)`;

export async function fetchMyTeam(leaderId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('leader_id', leaderId)
    .maybeSingle();
  return (data as unknown as Team) ?? null;
}

export async function fetchTeamWithMembers(teamId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('id', teamId)
    .single();
  return (data as unknown as Team) ?? null;
}

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
  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, rider_id: riderId });
  if (error) console.error('addTeamMember:', error);
  return !error;
}

export async function removeTeamMember(teamId: string, riderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('rider_id', riderId);
  return !error;
}
