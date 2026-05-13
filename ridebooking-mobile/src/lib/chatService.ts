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

export async function sendMessage(
  rideId: string,
  senderId: string,
  senderRole: 'user' | 'rider',
  senderName: string,
  content: string,
): Promise<ChatMessage | null> {
  const { error } = await supabase.from('messages').insert({
    ride_id: rideId,
    sender_id: senderId,
    sender_role: senderRole,
    sender_name: senderName,
    content,
  });
  if (error) return null;
  return {
    id: `local-${Date.now()}`,
    ride_id: rideId,
    sender_id: senderId,
    sender_role: senderRole,
    sender_name: senderName,
    content,
    created_at: new Date().toISOString(),
  };
}

export async function fetchMessages(rideId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });
  return (data as ChatMessage[]) ?? [];
}

export function subscribeToMessages(
  rideId: string,
  onMessage: (msg: ChatMessage) => void,
): () => void {
  const channel = supabase
    .channel(`chat_${rideId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const msg = payload.new as ChatMessage;
      if (msg?.ride_id === rideId) onMessage(msg);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export interface ConversationSummary {
  ride_id: string;
  other_name: string;
  last_message: string;
  last_time: string;
}

export async function fetchUserConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: userMsgs } = await supabase
    .from('messages')
    .select('ride_id')
    .eq('sender_id', userId);

  if (!userMsgs?.length) return [];
  const rideIds = [...new Set(userMsgs.map(m => m.ride_id))];

  const summaries = await Promise.all(
    rideIds.map(async (rideId) => {
      const [{ data: last }, { data: riderMsg }] = await Promise.all([
        supabase.from('messages').select('content, created_at').eq('ride_id', rideId)
          .order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('messages').select('sender_name').eq('ride_id', rideId)
          .eq('sender_role', 'rider').limit(1).single(),
      ]);
      return {
        ride_id: rideId,
        other_name: riderMsg?.sender_name ?? 'Rider',
        last_message: last?.content ?? '',
        last_time: last?.created_at ?? '',
      } as ConversationSummary;
    }),
  );

  return summaries
    .filter(s => s.last_message)
    .sort((a, b) => b.last_time.localeCompare(a.last_time));
}

export async function fetchRiderConversations(riderId: string): Promise<ConversationSummary[]> {
  const { data: riderMsgs } = await supabase
    .from('messages')
    .select('ride_id')
    .eq('sender_id', riderId);

  if (!riderMsgs?.length) return [];
  const rideIds = [...new Set(riderMsgs.map(m => m.ride_id))];

  const summaries = await Promise.all(
    rideIds.map(async (rideId) => {
      const [{ data: last }, { data: userMsg }] = await Promise.all([
        supabase.from('messages').select('content, created_at').eq('ride_id', rideId)
          .order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('messages').select('sender_name').eq('ride_id', rideId)
          .eq('sender_role', 'user').limit(1).single(),
      ]);
      return {
        ride_id: rideId,
        other_name: userMsg?.sender_name ?? 'Passenger',
        last_message: last?.content ?? '',
        last_time: last?.created_at ?? '',
      } as ConversationSummary;
    }),
  );

  return summaries
    .filter(s => s.last_message)
    .sort((a, b) => b.last_time.localeCompare(a.last_time));
}
