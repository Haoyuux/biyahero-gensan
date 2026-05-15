import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, SafeAreaView, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  rider_id: string | null;
  user_id: string;
  pickup: string;
  dropoff: string;
}

interface ReviewWithNames extends Review {
  riderName: string;
  passengerName: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={{ fontSize: 14, color: i <= rating ? '#f59e0b' : '#e5e7eb' }}>★</Text>
      ))}
    </View>
  );
}

export default function RideReviewsScreen() {
  const [reviews, setReviews] = useState<ReviewWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: rides } = await supabase
      .from('rides')
      .select('id, rating, comment, created_at, rider_id, user_id, pickup, dropoff')
      .not('rating', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!rides?.length) { setReviews([]); setLoading(false); setRefreshing(false); return; }

    const riderIds = [...new Set(rides.map((r: any) => r.rider_id).filter(Boolean))];
    const userIds = [...new Set(rides.map((r: any) => r.user_id))];

    const [{ data: riderProfiles }, { data: userProfiles }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', riderIds),
      supabase.from('profiles').select('id, full_name').in('id', userIds),
    ]);

    const riderMap: Record<string, string> = {};
    (riderProfiles ?? []).forEach((p: any) => { riderMap[p.id] = p.full_name ?? p.id.slice(0, 8); });
    const userMap: Record<string, string> = {};
    (userProfiles ?? []).forEach((p: any) => { userMap[p.id] = p.full_name ?? p.id.slice(0, 8); });

    setReviews(rides.map((r: any) => ({
      ...r,
      riderName: r.rider_id ? (riderMap[r.rider_id] ?? 'Unknown Rider') : 'No Rider',
      passengerName: userMap[r.user_id] ?? 'Unknown Passenger',
    })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={reviews}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        ListHeaderComponent={() => <Text style={s.pageTitle}>Ride Reviews</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Stars rating={item.rating ?? 0} />
              <Text style={s.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            {item.comment ? (
              <Text style={s.comment}>"{item.comment}"</Text>
            ) : (
              <Text style={s.noComment}>No comment</Text>
            )}
            <View style={s.names}>
              <View style={s.nameRow}>
                <Text style={s.nameLabel}>Rider</Text>
                <Text style={s.nameValue}>{item.riderName}</Text>
              </View>
              <View style={s.nameRow}>
                <Text style={s.nameLabel}>Passenger</Text>
                <Text style={s.nameValue}>{item.passengerName}</Text>
              </View>
            </View>
            <Text style={s.route} numberOfLines={1}>{item.pickup} → {item.dropoff}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No reviews yet</Text>}
        contentContainerStyle={s.list}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  date: { fontSize: 11, color: '#9ca3af' },
  comment: { fontSize: 14, color: '#030712', fontStyle: 'italic', marginBottom: 10 },
  noComment: { fontSize: 13, color: '#d1d5db', fontStyle: 'italic', marginBottom: 10 },
  names: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  nameRow: { flex: 1 },
  nameLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 },
  nameValue: { fontSize: 13, fontWeight: '600', color: '#374151' },
  route: { fontSize: 11, color: '#9ca3af' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
});
