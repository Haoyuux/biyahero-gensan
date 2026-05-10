import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';

interface Ride {
  id: string;
  pickup_label: string;
  dropoff_label: string;
  fare: number;
  ride_type: string;
  created_at: string;
  status: string;
}

const rideTypeLabel = (t: string) =>
  t === 'moto' ? '🏍️ Motorcycle' : t === 'eco' ? '🚕 Standard' : '🚙 Premium';

const statusColor = (s: string) =>
  s === 'completed' ? '#10b981' : s === 'cancelled' ? '#ef4444' : '#f59e0b';

const statusLabel = (s: string) =>
  s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : 'Pending';

export default function HistoryScreen() {
  const { profile } = useProfile();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRides = async () => {
    const { data } = await supabase
      .from('rides')
      .select('id, pickup_label, dropoff_label, fare, ride_type, created_at, status')
      .eq('rider_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setRides(data ?? []);
  };

  useEffect(() => {
    fetchRides().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRides();
    setRefreshing(false);
  };

  const totalEarned = rides
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (r.fare ?? 0), 0);

  const completedCount = rides.filter(r => r.status === 'completed').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      <Text style={styles.screenTitle}>Ride History</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>₱{totalEarned.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Total Earned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rides.length}</Text>
          <Text style={styles.statLabel}>All Rides</Text>
        </View>
      </View>

      <View style={styles.card}>
        {rides.length === 0 ? (
          <Text style={styles.emptyText}>No rides yet.</Text>
        ) : (
          rides.map((ride, idx) => (
            <View
              key={ride.id}
              style={[styles.rideItem, idx === rides.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rideType}>{rideTypeLabel(ride.ride_type)}</Text>
                <Text style={styles.rideRoute} numberOfLines={1}>
                  📍 {ride.pickup_label}
                </Text>
                <Text style={styles.rideRoute} numberOfLines={1}>
                  → {ride.dropoff_label}
                </Text>
                <Text style={styles.rideDate}>
                  {new Date(ride.created_at).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.rideFare}>₱{ride.fare}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(ride.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor(ride.status) }]}>
                    {statusLabel(ride.status)}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#030712', marginBottom: 16, letterSpacing: -0.3 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6',
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#030712' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#f3f4f6' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },

  rideItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  rideType: { fontSize: 13, fontWeight: '600', color: '#030712', marginBottom: 2 },
  rideRoute: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  rideDate: { fontSize: 11, color: '#d1d5db', marginTop: 4 },
  rideFare: { fontSize: 16, fontWeight: '700', color: '#030712' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
});
