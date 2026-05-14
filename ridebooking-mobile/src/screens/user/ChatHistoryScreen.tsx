import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal,
} from 'react-native';
import {
  ConversationSummary, ChatMessage,
  fetchUserConversations, fetchRiderConversations, fetchMessages,
} from '../../lib/chatService';

interface Props {
  visible: boolean;
  userId: string;
  role?: 'user' | 'rider';
  onClose: () => void;
  asTab?: boolean;
}

export default function ChatHistoryScreen({ visible, userId, role = 'user', onClose, asTab = false }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const fetch = role === 'rider' ? fetchRiderConversations : fetchUserConversations;
    fetch(userId)
      .then(setConversations)
      .finally(() => setLoading(false));
  }, [visible, userId, role]);

  const openConversation = async (conv: ConversationSummary) => {
    setSelectedRideId(conv.ride_id);
    setSelectedConv(conv);
    setMsgLoading(true);
    const msgs = await fetchMessages(conv.ride_id);
    setMessages(msgs);
    setMsgLoading(false);
  };

  const closeConversation = () => {
    setSelectedRideId(null);
    setSelectedConv(null);
    setMessages([]);
  };

  const content = (
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, asTab && styles.headerTab]}>
          {selectedRideId ? (
            <TouchableOpacity onPress={closeConversation} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          ) : asTab ? (
            <View style={{ width: 36 }} />
          ) : (
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Text style={styles.backText}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {selectedRideId ? (selectedConv?.other_name ?? 'Conversation') : 'Messages'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Conversation list */}
        {!selectedRideId && (
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10b981" />
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>Your ride conversations will appear here.</Text>
            </View>
          ) : (
            <ScrollView>
              {conversations.map(conv => (
                <TouchableOpacity
                  key={conv.ride_id}
                  style={styles.convRow}
                  onPress={() => openConversation(conv)}
                  activeOpacity={0.7}
                >
                  <View style={styles.convAvatar}>
                    <Text style={styles.convAvatarText}>
                      {conv.other_name[0]?.toUpperCase() ?? 'R'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.convName}>{conv.other_name}</Text>
                    <Text style={styles.convPreview} numberOfLines={1}>{conv.last_message}</Text>
                  </View>
                  <Text style={styles.convTime}>
                    {conv.last_time
                      ? new Date(conv.last_time).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                      : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        )}

        {/* Message thread (read-only) */}
        {selectedRideId && (
          msgLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10b981" />
            </View>
          ) : (
            <ScrollView
              style={styles.msgList}
              contentContainerStyle={{ padding: 16, gap: 8 }}
            >
              {messages.length === 0 && (
                <Text style={styles.emptySub}>No messages in this conversation.</Text>
              )}
              {messages.map(m => {
                const isMe = m.sender_role === role;
                return (
                  <View key={m.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                    <View style={[styles.msgBubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                      <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                        {m.content}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )
        )}
      </View>
  );

  if (asTab) return content;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff', paddingTop: 52,
  },
  headerTab: { paddingTop: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#030712' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#030712' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#030712' },
  emptySub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  convAvatar: {
    width: 44, height: 44, borderRadius: 99, backgroundColor: '#f0fdf4',
    alignItems: 'center', justifyContent: 'center',
  },
  convAvatarText: { fontSize: 18, fontWeight: '700', color: '#10b981' },
  convName: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  convPreview: { fontSize: 12, color: '#9ca3af' },
  convTime: { fontSize: 11, color: '#d1d5db' },
  msgList: { flex: 1, backgroundColor: '#f9fafb' },
  msgRow: { flexDirection: 'row', marginBottom: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMe: { backgroundColor: '#10b981' },
  bubbleThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6' },
  msgText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextThem: { color: '#111827' },
});
