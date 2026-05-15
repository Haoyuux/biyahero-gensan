import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  SafeAreaView, RefreshControl, ScrollView,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';

interface LiveStats {
  passengers: number;
  approvedRiders: number;
  onlineNow: number;
}

interface OngoingRide {
  id: string;
  status: string;
  pickup: string;
  dropoff: string;
  user_id: string;
  rider_id: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  accepted: '#10b981',
  completed: '#6b7280',
  cancelled: '#ef4444',
};

export default function AdminLiveScreen() {
  const [stats, setStats] = useState<LiveStats>({ passengers: 0, approvedRiders: 0, onlineNow: 0 });
  const [onlineRiders, setOnlineRiders] = useState<Profile[]>([]);
  const [ongoingRides, setOngoingRides] = useState<OngoingRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [
      { count: passengers },
      { count: approvedRiders },
      { data: riders },
      { data: rides },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'rider').eq('rider_status', 'approved'),
      supabase.from('profiles').select('*').eq('is_online', true).in('role', ['rider', 'team_leader']),
      supabase.from('rides').select('id,status,pickup,dropoff,user_id,rider_id').not('status', 'in', '(completed,cancelled)').order('created_at', { ascending: false }).limit(30),
    ]);

    setStats({
      passengers: passengers ?? 0,
      approvedRiders: approvedRiders ?? 0,
      onlineNow: riders?.length ?? 0,
    });
    setOnlineRiders((riders ?? []) as Profile[]);
    setOngoingRides(rides ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={ongoingRides}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        ListHeaderComponent={() => (
          <>
            <Text style={s.pageTitle}>Live Operations</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsRow} contentContainerStyle={s.statsContent}>
              <View style={s.statCard}>
                <Text style={s.statNum}>{stats.passengers}</Text>
                <Text style={s.statLabel}>Passengers</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statNum}>{stats.approvedRiders}</Text>
                <Text style={s.statLabel}>Approved Riders</Text>
              </View>
              <View style={[s.statCard, { borderColor: '#10b981' }]}>
                <Text style={[s.statNum, { color: '#10b981' }]}>{stats.onlineNow}</Text>
                <Text style={s.statLabel}>Online Now</Text>
              </View>
            </ScrollView>

            <Text style={s.sectionTitle}>Online Riders ({onlineRiders.length})</Text>
            {onlineRiders.length === 0 && <Text style={s.empty}>No riders online</Text>}
            {onlineRiders.map(r => (
              <View key={r.id} style={s.riderRow}>
                <View style={s.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.riderName}>{r.full_name ?? r.email}</Text>
                  <Text style={s.riderSub}>
                    {r.last_lat ? `${r.last_lat.toFixed(4)}, ${r.last_lng?.toFixed(4)}` : 'No GPS signal'}
                  </Text>
                </View>
                <View style={s.onlineBadge}>
                  <Text style={s.onlineBadgeText}>Online</Text>
                </View>
              </View>
            ))}

            <Text style={s.sectionTitle}>Ongoing Rides ({ongoingRides.length})</Text>
            {ongoingRides.length === 0 && <Text style={s.empty}>No active rides</Text>}
          </>
        )}
        renderItem={({ item }) => (
          <View style={s.rideCard}>
            <View style={s.rideHeader}>
              <Text style={s.rideId}>#{item.id.slice(0, 8)}</Text>
              <View style={[s.statusBadge, { backgroundColor: (STATUS_COLOR[item.status] ?? '#6b7280') + '20' }]}>
                <Text style={[s.statusText, { color: STATUS_COLOR[item.status] ?? '#6b7280' }]}>
                  {item.status}
                </Text>
              </View>
            </View>
            <Text style={s.rideRoute} numberOfLines={1}>{item.pickup}</Text>
            <Text style={s.rideArrow}>→</Text>
            <Text style={s.rideRoute} numberOfLines={1}>{item.dropoff}</Text>
          </View>
        )}
        contentContainerStyle={s.list}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 16 },
  statsRow: { marginBottom: 20 },
  statsContent: { gap: 10, paddingRight: 4 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    minWidth: 110, borderWidth: 1, borderColor: '#f3f4f6', alignItems: 'center',
  },
  statNum: { fontSize: 28, fontWeight: '800', color: '#030712' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10, marginTop: 8 },
  empty: { fontSize: 13, color: '#9ca3af', marginBottom: 16 },
  riderRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#f3f4f6', gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  riderName: { fontSize: 13, fontWeight: '600', color: '#030712' },
  riderSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  onlineBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  onlineBadgeText: { fontSize: 10, fontWeight: '600', color: '#059669' },
  rideCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  rideHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rideId: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  rideRoute: { fontSize: 13, color: '#374151' },
  rideArrow: { fontSize: 11, color: '#9ca3af', marginVertical: 2 },
});
