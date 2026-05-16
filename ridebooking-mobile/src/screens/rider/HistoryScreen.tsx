import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  TouchableOpacity, Modal, Image,
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

interface Errand {
  id: string;
  errand_type: string;
  pickup_label: string;
  dropoff_label: string;
  description: string | null;
  instructions: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  fare: number;
  created_at: string;
  completed_at: string | null;
  status: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
}

type HistoryItem =
  | { kind: 'ride'; sortDate: string; data: Ride }
  | { kind: 'errand'; sortDate: string; data: Errand };

const rideTypeLabel = (t: string) =>
  t === 'moto' ? 'Motorcycle' : t === 'eco' ? 'Standard' : 'Premium';

const errandTypeLabel = (t: string) =>
  t === 'buy' ? 'Buy Errand' : t === 'pickup_deliver' ? 'Pickup & Deliver' : 'Errand';

const statusColor = (s: string) =>
  s === 'completed' ? '#10b981' : s === 'cancelled' ? '#ef4444' : '#f59e0b';

const statusLabel = (s: string) =>
  s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : 'Pending';

export default function HistoryScreen() {
  const { profile } = useProfile();
  const [rides, setRides] = useState<Ride[]>([]);
  const [errands, setErrands] = useState<Errand[]>([]);
  const [selectedErrand, setSelectedErrand] = useState<Errand | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async () => {
    const [{ data: rideData }, { data: errandData }] = await Promise.all([
      supabase
        .from('rides')
        .select('id, pickup_label, dropoff_label, fare, ride_type, created_at, status')
        .eq('rider_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('errands')
        .select('id, errand_type, pickup_label, dropoff_label, description, instructions, recipient_name, recipient_phone, fare, created_at, completed_at, status, user_id, user_name, user_avatar')
        .eq('rider_id', profile.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50),
    ]);
    setRides(rideData ?? []);
    setErrands(errandData ?? []);
  };

  useEffect(() => {
    fetchHistory().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  const completedRides = rides.filter(r => r.status === 'completed');
  const totalEarned =
    completedRides.reduce((sum, r) => sum + (r.fare ?? 0), 0) +
    errands.reduce((sum, e) => sum + (e.fare ?? 0), 0);

  const completedCount = completedRides.length + errands.length;
  const historyItems: HistoryItem[] = [
    ...rides.map((ride): HistoryItem => ({ kind: 'ride', sortDate: ride.created_at, data: ride })),
    ...errands.map((errand): HistoryItem => ({ kind: 'errand', sortDate: errand.completed_at ?? errand.created_at, data: errand })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <>
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
            <Text style={styles.statValue}>P{totalEarned.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{historyItems.length}</Text>
            <Text style={styles.statLabel}>All Jobs</Text>
          </View>
        </View>

        <View style={styles.card}>
          {historyItems.length === 0 ? (
            <Text style={styles.emptyText}>No rides or errands yet.</Text>
          ) : (
            historyItems.map((item, idx) => (
              item.kind === 'errand'
                ? <ErrandItem key={`errand-${item.data.id}`} errand={item.data} isLast={idx === historyItems.length - 1} onPress={() => setSelectedErrand(item.data)} />
                : <RideItem key={`ride-${item.data.id}`} ride={item.data} isLast={idx === historyItems.length - 1} />
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={!!selectedErrand} transparent animationType="fade" onRequestClose={() => setSelectedErrand(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Completed Errand</Text>
              <TouchableOpacity onPress={() => setSelectedErrand(null)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedErrand && (
              <>
                <View style={styles.requesterCard}>
                  {selectedErrand.user_avatar ? (
                    <Image source={{ uri: selectedErrand.user_avatar }} style={styles.requesterAvatar} />
                  ) : (
                    <View style={styles.requesterAvatarFallback}>
                      <Text style={styles.requesterAvatarText}>{(selectedErrand.user_name ?? 'U')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requesterLabel}>Requested by</Text>
                    <Text style={styles.requesterName}>{selectedErrand.user_name ?? 'Unknown user'}</Text>
                    <Text style={styles.requesterMeta}>User ID: {selectedErrand.user_id.slice(0, 8)}</Text>
                  </View>
                </View>
                <DetailRow label="Type" value={errandTypeLabel(selectedErrand.errand_type)} />
                <DetailRow label="Pickup" value={selectedErrand.pickup_label} />
                <DetailRow label="Dropoff" value={selectedErrand.dropoff_label} />
                <DetailRow label="Description" value={selectedErrand.description ?? '-'} />
                <DetailRow label="Instructions" value={selectedErrand.instructions ?? '-'} />
                <DetailRow label="Recipient" value={selectedErrand.recipient_name ? `${selectedErrand.recipient_name}${selectedErrand.recipient_phone ? ' - ' + selectedErrand.recipient_phone : ''}` : '-'} />
                <DetailRow label="Completed" value={new Date(selectedErrand.completed_at ?? selectedErrand.created_at).toLocaleString('en-PH')} />
                <View style={styles.detailTotalRow}>
                  <Text style={styles.detailTotalLabel}>Fare</Text>
                  <Text style={styles.detailTotalValue}>P{selectedErrand.fare}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function RideItem({ ride, isLast }: { ride: Ride; isLast: boolean }) {
  return (
    <View style={[styles.rideItem, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rideType}>{rideTypeLabel(ride.ride_type)}</Text>
        <Text style={styles.rideRoute} numberOfLines={1}>Pickup: {ride.pickup_label}</Text>
        <Text style={styles.rideRoute} numberOfLines={1}>Dropoff: {ride.dropoff_label}</Text>
        <Text style={styles.rideDate}>
          {new Date(ride.created_at).toLocaleDateString('en-PH', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.rideFare}>P{ride.fare}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor(ride.status) + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor(ride.status) }]}>
            {statusLabel(ride.status)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ErrandItem({ errand, isLast, onPress }: { errand: Errand; isLast: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.rideItem, isLast && { borderBottomWidth: 0 }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rideType}>Completed Errand</Text>
        <Text style={styles.rideRoute} numberOfLines={1}>{errandTypeLabel(errand.errand_type)}</Text>
        <Text style={styles.rideRoute} numberOfLines={1}>{errand.pickup_label} {'->'} {errand.dropoff_label}</Text>
        <Text style={styles.rideDate}>
          {new Date(errand.completed_at ?? errand.created_at).toLocaleDateString('en-PH', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.rideFare}>P{errand.fare}</Text>
        <View style={[styles.statusBadge, { backgroundColor: '#10b98120' }]}>
          <Text style={[styles.statusText, { color: '#10b981' }]}>Completed</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: 'center' },

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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  detailCard: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#030712' },
  closeText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  requesterCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  requesterAvatar: { width: 42, height: 42, borderRadius: 21 },
  requesterAvatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  requesterAvatarText: { fontSize: 15, fontWeight: '800', color: '#6b7280' },
  requesterLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 },
  requesterName: { fontSize: 14, fontWeight: '800', color: '#030712', marginTop: 1 },
  requesterMeta: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  detailRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#030712', lineHeight: 18 },
  detailTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 },
  detailTotalLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  detailTotalValue: { fontSize: 20, fontWeight: '800', color: '#10b981' },
});
