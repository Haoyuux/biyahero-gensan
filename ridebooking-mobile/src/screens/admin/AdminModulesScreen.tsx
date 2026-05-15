import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from '../../navigation/adminTypes';

type NavProp = NativeStackNavigationProp<AdminMoreStackParamList, 'AdminModules'>;

const PHASES = [
  {
    label: 'PHASE 2 — FLEET & CONTENT',
    modules: [
      { route: 'DriverManagement', title: 'Driver Mgmt', icon: 'people', color: '#3b82f6' },
      { route: 'TeamManagement', title: 'Teams', icon: 'people-circle', color: '#8b5cf6' },
      { route: 'AdminNews', title: 'News Feed', icon: 'newspaper', color: '#f59e0b' },
    ],
  },
  {
    label: 'PHASE 3 — REPORTING',
    modules: [
      { route: 'BookingAnalytics', title: 'Analytics', icon: 'trending-up', color: '#10b981' },
      { route: 'RevenueDashboard', title: 'Revenue', icon: 'bar-chart', color: '#059669' },
      { route: 'RideReviews', title: 'Reviews', icon: 'star', color: '#f59e0b' },
    ],
  },
  {
    label: 'PHASE 4 — PLATFORM CONFIG',
    modules: [
      { route: 'PricingConfig', title: 'Pricing', icon: 'pricetag', color: '#6366f1' },
      { route: 'Vouchers', title: 'Vouchers', icon: 'ticket', color: '#ec4899' },
      { route: 'AppSettings', title: 'App Settings', icon: 'settings', color: '#6b7280' },
      { route: 'MaintenanceMode', title: 'Maintenance', icon: 'construct', color: '#ef4444' },
    ],
  },
  {
    label: 'PHASE 5 — SUPER ADMIN',
    modules: [
      { route: 'UserManagement', title: 'User Mgmt', icon: 'person-circle', color: '#0ea5e9' },
      { route: 'RolesPermissions', title: 'Roles & Perms', icon: 'shield', color: '#7c3aed' },
    ],
  },
] as const;

export default function AdminModulesScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>More Modules</Text>
        {PHASES.map(phase => (
          <View key={phase.label}>
            <Text style={s.phaseLabel}>{phase.label}</Text>
            <View style={s.grid}>
              {phase.modules.map(mod => (
                <TouchableOpacity
                  key={mod.route}
                  style={s.card}
                  onPress={() => navigation.navigate(mod.route as keyof AdminMoreStackParamList)}
                >
                  <View style={[s.iconBox, { backgroundColor: mod.color + '20' }]}>
                    <Ionicons name={mod.icon as any} size={22} color={mod.color} />
                  </View>
                  <Text style={s.cardTitle} numberOfLines={2}>{mod.title}</Text>
                  <Ionicons name="chevron-forward" size={13} color="#d1d5db" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 20 },
  phaseLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    width: '47.5%', borderWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  iconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: '#030712' },
});
