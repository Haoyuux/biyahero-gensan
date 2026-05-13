# User-Side Full Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all gaps between the mobile user-side and MOBILE_INTEGRATION.md — periodic ride broadcasting, RIDER_ARRIVED phase indicator, profile check, toast system, real rider stats, news modal, and chat history modal.

**Architecture:** All changes stay in existing files. `HomeScreen.tsx` receives 7 targeted additions. `chatService.ts` gets 3 new exported functions. One new file `ChatHistoryScreen.tsx` handles the conversation list modal rendered from inside `HomeScreen`. No new navigation routes needed — modals stack within the existing sheet layer.

**Tech Stack:** React Native, Expo SDK 54, @supabase/supabase-js v2, existing `newsService.ts`, existing `chatService.ts`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/lib/chatService.ts` | Add `ConversationSummary`, `fetchUserConversations`, `fetchRiderConversations` |
| Create | `src/screens/user/ChatHistoryScreen.tsx` | Conversation list + message thread modal |
| Modify | `src/screens/user/HomeScreen.tsx` | 7 targeted additions (see tasks below) |

---

## Task 1: Add conversation functions to chatService.ts

**Files:**
- Modify: `src/lib/chatService.ts`

- [ ] **Step 1: Add ConversationSummary interface and fetchUserConversations / fetchRiderConversations**

Append to the end of `src/lib/chatService.ts`:

```typescript
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
```

- [ ] **Step 2: Verify exports**

Run: `grep -n "export" src/lib/chatService.ts`

Expected output includes: `ConversationSummary`, `fetchUserConversations`, `fetchRiderConversations`

---

## Task 2: Create ChatHistoryScreen.tsx

**Files:**
- Create: `src/screens/user/ChatHistoryScreen.tsx`

- [ ] **Step 1: Create the file**

`src/screens/user/ChatHistoryScreen.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal,
} from 'react-native';
import {
  ConversationSummary, ChatMessage,
  fetchUserConversations, fetchMessages,
} from '../../lib/chatService';

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

export default function ChatHistoryScreen({ visible, userId, onClose }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchUserConversations(userId)
      .then(setConversations)
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const openConversation = async (rideId: string) => {
    setSelectedRideId(rideId);
    setMsgLoading(true);
    const msgs = await fetchMessages(rideId);
    setMessages(msgs);
    setMsgLoading(false);
  };

  const closeConversation = () => {
    setSelectedRideId(null);
    setMessages([]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {selectedRideId ? (
            <TouchableOpacity onPress={closeConversation} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Text style={styles.backText}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {selectedRideId ? 'Conversation' : 'Messages'}
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
                  onPress={() => openConversation(conv.ride_id)}
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
                const isMe = m.sender_role === 'user';
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    paddingTop: 52,
  },
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
```

---

## Task 3: HomeScreen — Toast notification system

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add toast state and refs**

After `const chatScrollRef = useRef<ScrollView>(null);` (around line 105), add:
```typescript
const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'warn' | 'error' } | null>(null);
const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Add showToast helper**

After the `clearRideState` function (around line 155), add:
```typescript
const showToast = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
  if (toastTimer.current) clearTimeout(toastTimer.current);
  setToast({ msg, type });
  toastTimer.current = setTimeout(() => setToast(null), 3200);
};
```

- [ ] **Step 3: Add toast banner JSX**

In the main return, right after `{renderPanel()}` (around line 1050) and before the Drawer Modal, add:
```tsx
{/* Toast Banner */}
{toast && (
  <View style={[styles.toastBanner, {
    backgroundColor:
      toast.type === 'success' ? '#10b981' :
      toast.type === 'warn'    ? '#f59e0b' :
      toast.type === 'error'   ? '#ef4444' : '#1e293b',
  }]}>
    <Text style={styles.toastText}>{toast.msg}</Text>
  </View>
)}
```

- [ ] **Step 4: Add toast styles**

In `StyleSheet.create`, add:
```typescript
toastBanner: {
  position: 'absolute', top: 52, left: 16, right: 16,
  borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13,
  shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
  elevation: 8, zIndex: 999,
},
toastText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
```

- [ ] **Step 5: Replace Alert.alert in RIDE_CANCELLED handler with showToast**

Find in rides channel useEffect (around line 315):
```typescript
Alert.alert('Ride cancelled', 'The rider cancelled your booking.');
```
Replace with:
```typescript
showToast('Rider cancelled. Finding a new rider...', 'warn');
```

---

## Task 4: HomeScreen — Periodic REQUEST_RIDE broadcast

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add broadcast refs**

After `const ridesChannel = useRef<any>(null);` (line 61), add:
```typescript
const broadcastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
const broadcastPayloadRef = useRef<any>(null);
```

- [ ] **Step 2: Add stopBroadcasting helper**

After the `showToast` function (from Task 3), add:
```typescript
const stopBroadcasting = () => {
  if (broadcastIntervalRef.current) {
    clearInterval(broadcastIntervalRef.current);
    broadcastIntervalRef.current = null;
  }
};
```

- [ ] **Step 3: Start interval in handleBook**

Find in `handleBook` (around line 454):
```typescript
supabase.channel('rides').send({ type: 'broadcast', event: 'REQUEST_RIDE', payload });
setIsBooking(false);
setStep('searching');
saveRideState({ step: 'searching' });
```
Replace with:
```typescript
broadcastPayloadRef.current = payload;
supabase.channel('rides').send({ type: 'broadcast', event: 'REQUEST_RIDE', payload });
stopBroadcasting();
broadcastIntervalRef.current = setInterval(() => {
  if (broadcastPayloadRef.current) {
    supabase.channel('rides').send({ type: 'broadcast', event: 'REQUEST_RIDE', payload: broadcastPayloadRef.current });
  }
}, 4000);
setIsBooking(false);
setStep('searching');
saveRideState({ step: 'searching' });
```

- [ ] **Step 4: Stop broadcasting when a rider is accepted**

Find in the rides channel useEffect (around line 306):
```typescript
ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  setPendingRider(payload.rider as Profile);
});
```
Replace with:
```typescript
ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  stopBroadcasting();
  setPendingRider(payload.rider as Profile);
  showToast('Rider found! Confirming...', 'success');
});
```

- [ ] **Step 5: Restart broadcasting when rider cancels after accepting**

Find the RIDE_CANCELLED handler (around line 315). After the existing code inside the handler, add the broadcast restart:
```typescript
ch.on('broadcast', { event: 'RIDE_CANCELLED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  showToast('Rider cancelled. Finding a new rider...', 'warn');
  setActiveRider(null);
  setRidePhase('going_to_pickup');
  setStep('searching');
  supabase.from('rides').update({ status: 'pending', rider_id: null }).eq('id', currentRideId);
  stopBroadcasting();
  broadcastIntervalRef.current = setInterval(() => {
    if (broadcastPayloadRef.current) {
      supabase.channel('rides').send({ type: 'broadcast', event: 'REQUEST_RIDE', payload: broadcastPayloadRef.current });
    }
  }, 4000);
});
```

(Note: `setRidePhase` is added in Task 5 — this is fine, order of task execution is sequential.)

- [ ] **Step 6: Stop broadcasting in cancelBooking and resetToHome**

Find `cancelBooking` (around line 460). Add `stopBroadcasting()` as the first line:
```typescript
const cancelBooking = async () => {
  stopBroadcasting();
  if (currentRideId) {
    supabase.channel('rides').send({ type: 'broadcast', event: 'CANCEL_RIDE', payload: { rideId: currentRideId } });
    await supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRideId);
  }
  resetToHome();
  clearRideState();
};
```

Find `resetToHome` (around line 469). Add `stopBroadcasting()` as the first line:
```typescript
const resetToHome = () => {
  stopBroadcasting();
  setStep('home'); setCurrentRideId(null); setActiveRider(null); setFareBreakdown(null);
  // ... rest stays unchanged
```

---

## Task 5: HomeScreen — RIDER_ARRIVED handling + ride phase indicator

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add ridePhase state**

After `const [showCancelConfirm, setShowCancelConfirm] = useState(false);` (around line 91), add:
```typescript
const [ridePhase, setRidePhase] = useState<'going_to_pickup' | 'arrived'>('going_to_pickup');
```

- [ ] **Step 2: Add RIDER_ARRIVED handler in rides channel**

In the rides channel useEffect, after the `RIDER_LOCATION` handler (around line 313), add:
```typescript
ch.on('broadcast', { event: 'RIDER_ARRIVED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  setRidePhase('arrived');
  showToast('Your rider has arrived! 🏍️', 'success');
});
```

- [ ] **Step 3: Reset ridePhase in resetToHome**

In `resetToHome`, add `setRidePhase('going_to_pickup');` alongside the other resets.

- [ ] **Step 4: Update matched panel status text to use ridePhase**

Find in the matched panel (around line 840):
```tsx
<Text style={styles.matchedStatusLbl}>ON THE WAY</Text>
<Text style={styles.matchedEta}>{etaMin ? `Arriving in ${etaMin} min` : 'On the way to pickup'}</Text>
```
Replace with:
```tsx
<Text style={[styles.matchedStatusLbl, ridePhase === 'arrived' && { color: '#10b981' }]}>
  {ridePhase === 'arrived' ? 'RIDER ARRIVED' : 'ON THE WAY'}
</Text>
<Text style={styles.matchedEta}>
  {ridePhase === 'arrived'
    ? 'Your rider has arrived!'
    : etaMin ? `Arriving in ${etaMin} min` : 'On the way to pickup'}
</Text>
```

---

## Task 6: HomeScreen — Profile completeness check before booking

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add check in "Find a Rider" button onPress**

Find the "Find a Rider" button `onPress` (around line 622, inside the home panel):
```typescript
onPress={() => {
  if (destinationCoords) {
    setStep('select');
    fetchUserVouchers(profile.id).then(setUserVouchers);
  } else {
    setActiveField('dropoff');
    setIsExpanded(true);
  }
}}
```
Replace with:
```typescript
onPress={() => {
  if (!destinationCoords) { setActiveField('dropoff'); setIsExpanded(true); return; }
  if (!profile.first_name || !profile.last_name || !profile.phone) {
    Alert.alert(
      'Complete your profile',
      'Please add your first name, last name, and phone number before booking.',
    );
    return;
  }
  setStep('select');
  fetchUserVouchers(profile.id).then(setUserVouchers);
}}
```

---

## Task 7: HomeScreen — Real rider rating + ride count

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add riderStats state**

After `const [riderReviews, setRiderReviews] = useState<...>([]);` (around line 112), add:
```typescript
const [riderStats, setRiderStats] = useState<{ avgRating: number; rideCount: number } | null>(null);
```

- [ ] **Step 2: Fetch stats in the rider reviews useEffect**

Find the rider reviews useEffect (around line 337). After `if (!activeRider?.id) { setRiderReviews([]); return; }`, add `setRiderStats(null);`:
```typescript
if (!activeRider?.id) { setRiderReviews([]); setRiderStats(null); return; }
```

Inside the async IIFE, before the existing `const { data: rides }` (which fetches reviews with rating >= 4), add:
```typescript
const { data: allRides } = await supabase
  .from('rides')
  .select('rating')
  .eq('rider_id', activeRider.id)
  .eq('status', 'completed')
  .not('rating', 'is', null);
const ratedRides = allRides ?? [];
const avgRating = ratedRides.length > 0
  ? ratedRides.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedRides.length
  : 0;

const { count: totalRides } = await supabase
  .from('rides')
  .select('id', { count: 'exact', head: true })
  .eq('rider_id', activeRider.id)
  .eq('status', 'completed');

setRiderStats({
  avgRating: Math.round(avgRating * 10) / 10,
  rideCount: totalRides ?? 0,
});
```

- [ ] **Step 3: Replace hardcoded rating in matched panel**

Find (around line 861):
```tsx
<Text style={styles.ratingText}>4.9 · 1.2k rides</Text>
```
Replace with:
```tsx
<Text style={styles.ratingText}>
  {riderStats
    ? `${riderStats.avgRating > 0 ? riderStats.avgRating.toFixed(1) : 'New'} · ${riderStats.rideCount} rides`
    : '...'}
</Text>
```

---

## Task 8: HomeScreen — News modal + wire drawer

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add news import**

In the imports at the top (after the voucherService import), add:
```typescript
import { fetchNewsPosts, NewsPost } from '../../lib/newsService';
```

- [ ] **Step 2: Add news state**

After the `[showVoucherPicker, setShowVoucherPicker]` state (around line 94), add:
```typescript
const [showNews, setShowNews] = useState(false);
const [newsPosts, setNewsPosts] = useState<NewsPost[]>([]);
const [newsLoading, setNewsLoading] = useState(false);
const [expandedPost, setExpandedPost] = useState<string | null>(null);
```

- [ ] **Step 3: Update drawer "News & Updates" to open news modal**

Find in `DRAWER_ITEMS` (around line 967):
```typescript
{ icon: '📋', label: 'News & Updates', onPress: () => Alert.alert('Coming soon') },
```
Replace with:
```typescript
{ icon: '📋', label: 'News & Updates', onPress: () => {
  setShowDrawer(false);
  setNewsLoading(true);
  setShowNews(true);
  fetchNewsPosts().then(posts => { setNewsPosts(posts); setNewsLoading(false); });
}},
```

- [ ] **Step 4: Add news modal JSX**

Right before the closing `</View>` of the main return (after the voucher modal), add:

```tsx
{/* News Modal */}
<Modal visible={showNews} animationType="slide" onRequestClose={() => setShowNews(false)}>
  <View style={styles.newsContainer}>
    <View style={styles.newsHeader}>
      <TouchableOpacity onPress={() => setShowNews(false)} style={styles.newsCloseBtn}>
        <Text style={styles.newsCloseText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.newsHeaderTitle}>News & Updates</Text>
      <View style={{ width: 36 }} />
    </View>

    {newsLoading ? (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    ) : (
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {newsPosts.length === 0 ? (
          <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>No announcements yet.</Text>
        ) : newsPosts.map(post => {
          const isOpen = expandedPost === post.id;
          const catColors: Record<string, string> = {
            Announcement: '#6366f1', Update: '#3b82f6', Promo: '#10b981',
            Event: '#f59e0b', Important: '#ef4444',
          };
          const color = catColors[post.category] ?? '#6b7280';
          return (
            <TouchableOpacity
              key={post.id}
              style={styles.newsCard}
              onPress={() => setExpandedPost(isOpen ? null : post.id)}
              activeOpacity={0.85}
            >
              {post.image_url && (
                <Image source={{ uri: post.image_url }} style={styles.newsImage} />
              )}
              <View style={styles.newsCardBody}>
                <View style={styles.newsMetaRow}>
                  <View style={[styles.newsCatBadge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.newsCatText, { color }]}>{post.category}</Text>
                  </View>
                  <Text style={styles.newsDateText}>
                    {new Date(post.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={styles.newsTitle}>{post.title}</Text>
                {isOpen
                  ? <Text style={styles.newsContent}>{post.content}</Text>
                  : <Text style={styles.newsExcerpt} numberOfLines={2}>{post.content}</Text>
                }
                <Text style={styles.newsReadMore}>{isOpen ? 'Show less ↑' : 'Read more ↓'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    )}
  </View>
</Modal>
```

- [ ] **Step 5: Add news modal styles**

In `StyleSheet.create`, add:
```typescript
newsContainer: { flex: 1, backgroundColor: '#f9fafb' },
newsHeader: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingHorizontal: 16, paddingVertical: 14,
  borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  backgroundColor: '#fff', paddingTop: 52,
},
newsCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
newsCloseText: { fontSize: 18, color: '#030712' },
newsHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#030712' },
newsCard: { backgroundColor: '#fff', borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
newsImage: { width: '100%', height: 160 },
newsCardBody: { padding: 16 },
newsMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
newsCatBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
newsCatText: { fontSize: 11, fontWeight: '700' },
newsDateText: { fontSize: 11, color: '#d1d5db' },
newsTitle: { fontSize: 16, fontWeight: '700', color: '#030712', marginBottom: 6, letterSpacing: -0.2 },
newsExcerpt: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
newsContent: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 4 },
newsReadMore: { fontSize: 12, color: '#10b981', fontWeight: '600', marginTop: 6 },
```

---

## Task 9: HomeScreen — Chat History modal + wire drawer

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Import ChatHistoryScreen**

Add import at top (after the newsService import):
```typescript
import ChatHistoryScreen from './ChatHistoryScreen';
```

- [ ] **Step 2: Add showChatHistory state**

After the news state variables (from Task 8), add:
```typescript
const [showChatHistory, setShowChatHistory] = useState(false);
```

- [ ] **Step 3: Update drawer "Messages" item**

Find in `DRAWER_ITEMS`:
```typescript
{ icon: '💬', label: 'Messages', onPress: () => Alert.alert('Coming soon') },
```
Replace with:
```typescript
{ icon: '💬', label: 'Messages', onPress: () => { setShowDrawer(false); setShowChatHistory(true); } },
```

- [ ] **Step 4: Add ChatHistoryScreen to main return**

Right before the closing `</View>` of the main return (after the news modal), add:
```tsx
<ChatHistoryScreen
  visible={showChatHistory}
  userId={profile.id}
  onClose={() => setShowChatHistory(false)}
/>
```

- [ ] **Step 5: Commit all changes**

```bash
git add src/lib/chatService.ts src/screens/user/ChatHistoryScreen.tsx src/screens/user/HomeScreen.tsx
git commit -m "feat: user-side full integration — broadcast loop, RIDER_ARRIVED, profile check, toast, real stats, news modal, chat history"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Periodic REQUEST_RIDE broadcast every 4s — Task 4
- ✅ RIDER_ARRIVED handling + phase text — Task 5
- ✅ Profile completeness check — Task 6
- ✅ Toast notifications replacing Alert.alert for ride events — Task 3
- ✅ Real rider rating + count — Task 7
- ✅ News modal in drawer — Task 8
- ✅ Chat history (Messages) in drawer — Tasks 1, 2, 9
- ✅ fetchUserConversations/fetchRiderConversations — Task 1

**Type consistency:**
- `ridePhase` introduced in Task 5 — referenced in Task 4 (RIDE_CANCELLED handler). Tasks must be executed in order 3→4→5 or Task 4 Step 5 must be done after Task 5 Step 1.
- `showToast` introduced in Task 3 — referenced in Tasks 4 and 5. Task 3 must execute before 4 and 5.
- `ConversationSummary` defined in Task 1 — used in Task 2. Task 1 must execute first.
- `riderStats` introduced in Task 7 — displayed in Task 7 Step 3. Self-contained. ✅

**Execution order constraint:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 (sequential, each depends on previous).
