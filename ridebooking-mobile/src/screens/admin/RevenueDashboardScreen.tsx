import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, SafeAreaView, RefreshControl, ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface RideRow {
  id: string;
  fare: number;
  booking_fee: number;
  voucher_discount: number;
  created_at: string;
  pickup: string;
  dropoff: string;
  ride_type: string;
}

interface RevenueStats {
  grossTotal: number;
  grossThisWeek: number;
  grossLastWeek: number;
}

const RIDE_TYPE_COLOR: Record<string, string> = {
  moto: '#f59e0b',
  eco: '#10b981',
  premium: '#6366f1',
};

export default function RevenueDashboardScreen() {
  const [stats, setStats] = useState<RevenueStats>({ grossTotal: 0, grossThisWeek: 0, grossLastWeek: 0 });
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('rides')
      .select('id, fare, booking_fee, voucher_discount, created_at, pickup, dropoff, ride_type')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100);

    const rideList = (data ?? []) as RideRow[];
    let grossTotal = 0, grossThisWeek = 0, grossLastWeek = 0;

    rideList.forEach(r => {
      const net = (r.fare ?? 0) - (r.voucher_discount ?? 0);
      grossTotal += net;
      const d = new Date(r.created_at);
      if (d >= startOfWeek) grossThisWeek += net;
      else if (d >= startOfLastWeek) grossLastWeek += net;
    });

    setStats({ grossTotal, grossThisWeek, grossLastWeek });
    setRides(rideList);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={rides}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        ListHeaderComponent={() => (
          <>
            <Text style={s.pageTitle}>Revenue Dashboard</Text>
            <Text style={s.note}>Based on last 100 completed rides</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsContent}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Last 100 Rides</Text>
                <Text style={s.statNum}>₱{stats.grossTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>This Week</Text>
                <Text style={[s.statNum, { color: '#10b981' }]}>₱{stats.grossThisWeek.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Last Week</Text>
                <Text style={s.statNum}>₱{stats.grossLastWeek.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              </View>
            </ScrollView>

            <Text style={s.sectionTitle}>Recent Rides</Text>
          </>
        )}
        renderItem={({ item }) => (
          <View style={s.rideCard}>
            <View style={s.rideHeader}>
              <Text style={s.rideDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
              <View style={[s.typeBadge, { backgroundColor: (RIDE_TYPE_COLOR[item.ride_type] ?? '#6b7280') + '20' }]}>
                <Text style={[s.typeBadgeText, { color: RIDE_TYPE_COLOR[item.ride_type] ?? '#6b7280' }]}>{item.ride_type}</Text>
              </View>
              <Text style={s.fare}>₱{item.fare?.toFixed(2) ?? '0.00'}</Text>
            </View>
            <Text style={s.route} numberOfLines={1}>{item.pickup}</Text>
            <Text style={s.rideArrow}>→</Text>
            <Text style={s.route} numberOfLines={1}>{item.dropoff}</Text>
            {(item.voucher_discount > 0) && (
              <Text style={s.discount}>Discount: −₱{item.voucher_discount.toFixed(2)}</Text>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No completed rides found</Text>}
        contentContainerStyle={s.list}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 4 },
  note: { fontSize: 11, color: '#9ca3af', marginBottom: 16 },
  statsContent: { gap: 10, paddingRight: 4, marginBottom: 20 },
  statCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, minWidth: 140, borderWidth: 1, borderColor: '#f3f4f6' },
  statLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  statNum: { fontSize: 18, fontWeight: '800', color: '#030712' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  rideCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  rideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rideDate: { fontSize: 11, color: '#9ca3af', flex: 1 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  fare: { fontSize: 14, fontWeight: '700', color: '#030712' },
  route: { fontSize: 12, color: '#374151' },
  rideArrow: { fontSize: 11, color: '#9ca3af', marginVertical: 1 },
  discount: { fontSize: 11, color: '#ef4444', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
});
