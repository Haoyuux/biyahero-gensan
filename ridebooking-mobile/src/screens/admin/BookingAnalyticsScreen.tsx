import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BAR_MAX_H = 100;

interface AnalyticsData {
  dayCounts: number[];
  totalThisWeek: number;
  totalLastWeek: number;
  allTimeTotal: number;
}

export default function BookingAnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData>({ dayCounts: new Array(7).fill(0), totalThisWeek: 0, totalLastWeek: 0, allTimeTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = startOfLastWeek.toISOString();

    const [{ data: recentRides }, { count: allTime }] = await Promise.all([
      supabase
        .from('rides')
        .select('completed_at')
        .eq('status', 'completed')
        .gte('completed_at', twoWeeksAgo),
      supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
    ]);

    const dayCounts = new Array(7).fill(0);
    let totalThisWeek = 0;
    let totalLastWeek = 0;

    (recentRides ?? []).forEach((ride: any) => {
      const rideDate = new Date(ride.completed_at);
      if (rideDate >= startOfWeek) {
        dayCounts[rideDate.getDay()]++;
        totalThisWeek++;
      } else {
        totalLastWeek++;
      }
    });

    setData({ dayCounts, totalThisWeek, totalLastWeek, allTimeTotal: allTime ?? 0 });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  const maxVal = Math.max(...data.dayCounts, 1);
  const delta = data.totalLastWeek > 0
    ? ((data.totalThisWeek - data.totalLastWeek) / data.totalLastWeek * 100).toFixed(1)
    : null;
  const today = new Date().getDay();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
      >
        <Text style={s.pageTitle}>Booking Analytics</Text>

        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{data.totalThisWeek}</Text>
            <Text style={s.statLabel}>This Week</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{data.totalLastWeek}</Text>
            <Text style={s.statLabel}>Last Week</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: delta === null ? '#030712' : parseFloat(delta ?? '0') >= 0 ? '#10b981' : '#ef4444' }]}>
              {delta !== null ? `${parseFloat(delta ?? '0') >= 0 ? '+' : ''}${delta}%` : '—'}
            </Text>
            <Text style={s.statLabel}>vs Last Week</Text>
          </View>
        </View>

        <View style={s.allTimeCard}>
          <Text style={s.allTimeLabel}>All-Time Completed Rides</Text>
          <Text style={s.allTimeNum}>{data.allTimeTotal.toLocaleString()}</Text>
        </View>

        {/* Bar chart */}
        <View style={s.chartCard}>
          <Text style={s.chartTitle}>This Week — Rides by Day</Text>
          <View style={s.chart}>
            {data.dayCounts.map((count, i) => (
              <View key={i} style={s.barCol}>
                <Text style={s.barLabel}>{count > 0 ? count : ''}</Text>
                <View style={s.barBg}>
                  <View
                    style={[
                      s.bar,
                      { height: Math.max(4, (count / maxVal) * BAR_MAX_H) },
                      i === today && s.barToday,
                    ]}
                  />
                </View>
                <Text style={[s.dayLabel, i === today && s.dayLabelToday]}>{DAYS[i].slice(0, 2)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#030712' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  allTimeCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  allTimeLabel: { fontSize: 13, color: '#6b7280' },
  allTimeNum: { fontSize: 22, fontWeight: '800', color: '#030712' },
  chartCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  chartTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barLabel: { fontSize: 9, color: '#9ca3af', height: 12 },
  barBg: { flex: 1, justifyContent: 'flex-end', width: '70%' },
  bar: { backgroundColor: '#d1fae5', borderRadius: 4, width: '100%' },
  barToday: { backgroundColor: '#10b981' },
  dayLabel: { fontSize: 9, color: '#9ca3af', fontWeight: '600' },
  dayLabelToday: { color: '#10b981' },
});
