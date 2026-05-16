import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProfile } from '../../contexts/AuthContext';
import {
  getRiderDailyStats,
  getRiderRemittances,
  uploadReceipt,
  createRemittance,
  Remittance,
} from '../../lib/remittanceService';
import { getAppSettings } from '../../lib/settingsService';

interface DailyStats {
  totalEarnings: number;
  totalBookingFee: number;
  rideCount: number;
}

const today = () => new Date().toISOString().split('T')[0];

const statusColor = (s: string) =>
  s === 'approved' ? '#10b981' : s === 'rejected' ? '#ef4444' : '#f59e0b';

const statusLabel = (s: string) =>
  s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending';

export default function RemitScreen() {
  const { profile } = useProfile();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [todayRemit, setTodayRemit] = useState<Remittance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const fetchData = async () => {
    const date = today();

    const [dailyStats, allRemits, settings] = await Promise.all([
      getRiderDailyStats(profile.id, date),
      getRiderRemittances(profile.id),
      getAppSettings(),
    ]);

    setStats({
      totalEarnings: dailyStats.totalEarnings,
      totalBookingFee: dailyStats.totalBookingFee,
      rideCount: dailyStats.ridesCount,
    });
    setRemittances(allRemits);
    setTodayRemit(allRemits.find(r => r.remittance_date === date) ?? null);
    setQrUrl(settings?.remittance_qr_url ?? null);
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleSubmit = async () => {
    if (!stats || stats.totalBookingFee === 0) {
      Alert.alert('Nothing to remit', 'No completed rides today.');
      return;
    }
    if (todayRemit) {
      Alert.alert('Already submitted', 'You already submitted a remittance for today.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setSubmitting(true);
    const uri = result.assets[0].uri;

    const receiptUrl = await uploadReceipt(profile.id, uri);
    if (!receiptUrl) {
      setSubmitting(false);
      Alert.alert('Upload failed', 'Could not upload receipt. Try again.');
      return;
    }

    const remittance = await createRemittance(
      profile.id,
      `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
      profile.avatar_url ?? null,
      today(),
      stats.totalEarnings,
      stats.totalBookingFee,
      stats.totalBookingFee,
      receiptUrl,
      stats.rideCount,
    );

    setSubmitting(false);
    if (!remittance) {
      Alert.alert('Error', 'Failed to submit remittance. Try again.');
      return;
    }
    Alert.alert('Submitted!', 'Your remittance is pending admin approval.');
    await fetchData();
  };

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
      <Text style={styles.screenTitle}>Remittance</Text>
      <Text style={styles.dateLabel}>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>

      {/* Today summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Rides completed</Text>
          <Text style={styles.summaryVal}>{stats?.rideCount ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross earnings</Text>
          <Text style={styles.summaryVal}>₱{stats?.totalEarnings.toFixed(2) ?? '0.00'}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryHighlight]}>
          <Text style={[styles.summaryLabel, { color: '#030712', fontWeight: '700' }]}>Amount to remit</Text>
          <Text style={[styles.summaryVal, { color: '#10b981', fontSize: 20 }]}>
            ₱{stats?.totalBookingFee.toFixed(2) ?? '0.00'}
          </Text>
        </View>
      </View>

      {/* QR Code */}
      {qrUrl && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>GCash / Payment QR</Text>
          <Text style={styles.qrHint}>Scan to send your remittance, then upload your receipt below.</Text>
          <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
        </View>
      )}

      {/* Submit button */}
      {todayRemit ? (
        <View style={[styles.submitBtn, { backgroundColor: '#f0fdf4' }]}>
          <Text style={[styles.submitText, { color: '#10b981' }]}>
            ✓ Remittance submitted — {statusLabel(todayRemit.status)}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Upload Receipt & Submit</Text>
          )}
        </TouchableOpacity>
      )}

      {/* History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>History</Text>
        {remittances.length === 0 ? (
          <Text style={styles.emptyText}>No remittances yet.</Text>
        ) : (
          remittances.map((r, idx) => (
            <View
              key={r.id}
              style={[styles.historyItem, idx === remittances.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View>
                <Text style={styles.historyDate}>
                  {new Date(r.remittance_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={styles.historyEarnings}>Earnings ₱{r.total_earnings.toFixed(0)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.historyFee}>₱{r.amount_remitted.toFixed(0)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(r.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor(r.status) }]}>
                    {statusLabel(r.status)}
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
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  dateLabel: { fontSize: 13, color: '#9ca3af', marginBottom: 16, marginTop: 2 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 14 },

  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  summaryHighlight: { borderBottomWidth: 0, marginTop: 4, paddingTop: 14 },
  summaryLabel: { fontSize: 13, color: '#6b7280' },
  summaryVal: { fontSize: 14, fontWeight: '600', color: '#030712' },

  qrHint: { fontSize: 12, color: '#9ca3af', marginBottom: 12 },
  qrImage: { width: '100%', height: 220, borderRadius: 12 },

  submitBtn: {
    backgroundColor: '#10b981', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  historyItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  historyDate: { fontSize: 13, fontWeight: '600', color: '#030712' },
  historyEarnings: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  historyFee: { fontSize: 15, fontWeight: '700', color: '#030712' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
});
