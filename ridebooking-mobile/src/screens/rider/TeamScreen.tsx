import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useProfile } from '../../contexts/AuthContext';
import { fetchMyTeam, fetchRiderMembership, fetchTeamWithMembers, Team } from '../../lib/teamService';

interface MemberDisplay {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_online: boolean;
  rider_status: string | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TeamScreen() {
  const { profile } = useProfile();
  const isLeader = profile.role === 'team_leader';

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<MemberDisplay[]>([]);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (isLeader) {
      const teamData = await fetchMyTeam(profile.id);
      if (teamData) {
        setTeam(teamData);
        setMembers(
          (teamData.members ?? [])
            .map(m => m.rider)
            .filter(Boolean) as MemberDisplay[],
        );
      } else {
        setTeam(null);
        setMembers([]);
      }
    } else {
      const membership = await fetchRiderMembership(profile.id);
      setMyTeam(membership);
      if (membership) {
        const teamWithMembers = await fetchTeamWithMembers(membership.id);
        setMembers(
          (teamWithMembers?.members ?? [])
            .map(m => m.rider)
            .filter(Boolean) as MemberDisplay[],
        );
      } else {
        setMembers([]);
      }
    }
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const activeTeam = isLeader ? team : myTeam;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!activeTeam) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        <Text style={styles.screenTitle}>Team</Text>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Not in a team yet</Text>
          <Text style={styles.emptyText}>
            {isLeader ? 'Contact admin to create your team.' : 'Ask your team leader to add you.'}
          </Text>
        </View>
      </ScrollView>
    );
  }

  const onlineCount = members.filter(m => m.is_online).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      <Text style={styles.screenTitle}>Team</Text>

      {/* Team info card */}
      <View style={styles.teamCard}>
        <View style={styles.teamIconWrap}>
          <Text style={styles.teamIcon}>👥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{activeTeam.name}</Text>
          <Text style={styles.teamMeta}>
            {members.length}/{activeTeam.capacity} riders · {onlineCount} online
          </Text>
          {isLeader && (
            <View style={styles.leaderBadge}>
              <Text style={styles.leaderBadgeText}>TEAM LEADER</Text>
            </View>
          )}
        </View>
      </View>

      {/* Schedule */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedule</Text>
        <View style={styles.daysRow}>
          {DAYS.map((day, idx) => {
            const active = activeTeam.schedule_days?.includes(idx);
            return (
              <View key={day} style={[styles.dayChip, active && styles.dayChipActive]}>
                <Text style={[styles.dayText, active && styles.dayTextActive]}>{day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Members */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Members ({members.length})</Text>
        {members.length === 0 ? (
          <Text style={styles.emptyListText}>No members yet.</Text>
        ) : (
          members.map((m, idx) => {
            const name = m.full_name || `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unknown';
            return (
              <View
                key={m.id}
                style={[styles.memberItem, idx === members.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>
                    {name[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{name}</Text>
                  {m.phone && <Text style={styles.memberPhone}>{m.phone}</Text>}
                </View>
                <View style={[styles.onlineDot, { backgroundColor: m.is_online ? '#10b981' : '#e5e7eb' }]} />
              </View>
            );
          })
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

  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },

  teamCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  teamIconWrap: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#f0fdf4',
    alignItems: 'center', justifyContent: 'center',
  },
  teamIcon: { fontSize: 26 },
  teamName: { fontSize: 18, fontWeight: '700', color: '#030712', letterSpacing: -0.2 },
  teamMeta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  leaderBadge: {
    marginTop: 6, backgroundColor: '#10b981', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  leaderBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 1 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 14 },

  daysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6',
  },
  dayChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  dayText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  dayTextActive: { color: '#fff' },

  emptyListText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  memberItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 99, backgroundColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { fontSize: 16, fontWeight: '700', color: '#374151' },
  memberName: { fontSize: 14, fontWeight: '600', color: '#030712' },
  memberPhone: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  onlineDot: { width: 10, height: 10, borderRadius: 99 },
});
