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
