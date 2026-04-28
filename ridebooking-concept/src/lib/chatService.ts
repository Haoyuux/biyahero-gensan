// ─── Chat Service ─────────────────────────────────────────────────────────────
// All chat logic goes through this module. Messages are persisted in Supabase
// and delivered in real-time via postgres_changes on the messages table.
//
// Required Supabase migration (run once in SQL editor):
// ─────────────────────────────────────────────────────
// create table if not exists messages (
//   id           uuid primary key default gen_random_uuid(),
//   ride_id      text not null,
//   sender_id    uuid not null references auth.users(id) on delete cascade,
//   sender_role  text not null check (sender_role in ('user', 'rider')),
//   sender_name  text not null,
//   content      text not null,
//   created_at   timestamptz default now() not null
// );
// create index if not exists messages_ride_id_idx  on messages(ride_id);
// create index if not exists messages_sender_idx   on messages(sender_id);
// alter table messages enable row level security;
// create policy "read messages" on messages for select using (auth.role() = 'authenticated');
// create policy "insert own messages" on messages for insert with check (auth.uid() = sender_id);
// alter publication supabase_realtime add table messages;

import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_role: 'user' | 'rider';
  sender_name: string;
  content: string;
  created_at: string;
}

export interface ConversationSummary {
  ride_id: string;
  other_name: string;
  last_message: string;
  last_time: string;
}

/** Insert a message into the database. */
export async function sendMessage(
  rideId: string,
  senderId: string,
  senderRole: 'user' | 'rider',
  senderName: string,
  content: string,
): Promise<{ data: ChatMessage | null; error: any }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ ride_id: rideId, sender_id: senderId, sender_role: senderRole, sender_name: senderName, content })
    .select()
    .single();
  
  if (error) {
    console.error('Chat error:', error);
    return { data: null, error };
  }
  return { data: data as ChatMessage, error: null };
}

/** Load full message history for a ride (oldest first). */
export async function fetchMessages(rideId: string): Promise<{ messages: ChatMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchMessages error:', error);
    return { messages: [], error: error.message };
  }
  return { messages: (data as ChatMessage[]) ?? [], error: null };
}

/**
 * Subscribe to new messages on a ride via Supabase Realtime.
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToMessages(
  rideId: string,
  onMessage: (msg: ChatMessage) => void,
  onStatus?: (status: string) => void,
): () => void {
  // Subscribe to ALL inserts on messages and filter in JS.
  // This is more reliable than Postgres level filters which often require
  // Replica Identity Full to be enabled on the table.
  const channel = supabase
    .channel(`chat_room_${rideId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const newMsg = payload.new as ChatMessage;
        if (newMsg && newMsg.ride_id === rideId) {
          onMessage(newMsg);
        }
      },
    )
    .subscribe((status) => {
      console.log(`Chat subscribe status for ${rideId}:`, status);
      onStatus?.(status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Soft-delete a conversation for the current user only.
 * The other party's view is unaffected.
 */
export async function deleteConversation(rideId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('conversation_deletions')
    .upsert({ ride_id: rideId, deleted_by: userId }, { onConflict: 'ride_id,deleted_by' });
  return !error;
}

/** Fetch ride_ids that the given user has soft-deleted. */
async function fetchDeletedRideIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('conversation_deletions')
    .select('ride_id')
    .eq('deleted_by', userId);
  return new Set((data ?? []).map((d) => d.ride_id));
}

/**
 * Get a list of all past conversations for a user (one entry per ride_id).
 * Excludes conversations the user has deleted. Returns most-recent-first.
 */
export async function fetchUserConversations(userId: string): Promise<ConversationSummary[]> {
  const [{ data: userMsgs }, deletedIds] = await Promise.all([
    supabase.from('messages').select('ride_id').eq('sender_id', userId),
    fetchDeletedRideIds(userId),
  ]);

  if (!userMsgs?.length) return [];

  const rideIds = [...new Set(userMsgs.map((m) => m.ride_id))].filter(
    (id) => !deletedIds.has(id),
  );

  if (!rideIds.length) return [];

  const summaries = await Promise.all(
    rideIds.map(async (rideId) => {
      const { data: last } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { data: riderMsg } = await supabase
        .from('messages')
        .select('sender_name')
        .eq('ride_id', rideId)
        .eq('sender_role', 'rider')
        .limit(1)
        .single();

      return {
        ride_id: rideId,
        other_name: riderMsg?.sender_name ?? 'Rider',
        last_message: last?.content ?? '',
        last_time: last?.created_at ?? '',
      } satisfies ConversationSummary;
    }),
  );

  return summaries.sort((a, b) => b.last_time.localeCompare(a.last_time));
}

/** Same as fetchUserConversations but from the rider's perspective. */
export async function fetchRiderConversations(riderId: string): Promise<ConversationSummary[]> {
  const [{ data: riderMsgs }, deletedIds] = await Promise.all([
    supabase.from('messages').select('ride_id').eq('sender_id', riderId),
    fetchDeletedRideIds(riderId),
  ]);

  if (!riderMsgs?.length) return [];

  const rideIds = [...new Set(riderMsgs.map((m) => m.ride_id))].filter(
    (id) => !deletedIds.has(id),
  );

  if (!rideIds.length) return [];

  const summaries = await Promise.all(
    rideIds.map(async (rideId) => {
      const { data: last } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { data: userMsg } = await supabase
        .from('messages')
        .select('sender_name')
        .eq('ride_id', rideId)
        .eq('sender_role', 'user')
        .limit(1)
        .single();

      return {
        ride_id: rideId,
        other_name: userMsg?.sender_name ?? 'Passenger',
        last_message: last?.content ?? '',
        last_time: last?.created_at ?? '',
      } satisfies ConversationSummary;
    }),
  );

  return summaries.sort((a, b) => b.last_time.localeCompare(a.last_time));
}
