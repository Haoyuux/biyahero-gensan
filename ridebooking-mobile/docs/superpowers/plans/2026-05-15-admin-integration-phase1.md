# Admin Integration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-gated AdminNavigator to the mobile app with Live Operations, Rider Verification, Remittances, and User Blocking screens, backed by Supabase Edge Functions for all write operations.

**Architecture:** Admin/super_admin roles are routed to a dedicated bottom-tab AdminNavigator. Reads use the anon key + RLS. Writes (approve rider, review remittance, block/unblock user) call Supabase Edge Functions that verify the caller's JWT role before executing with the service key.

**Tech Stack:** React Native (Expo 54), TypeScript, @supabase/supabase-js v2, @react-navigation/bottom-tabs, Supabase Edge Functions (Deno)

---

## Prerequisites (Supabase RLS — do once in dashboard)

Run these in Supabase SQL Editor if not already present:

```sql
-- Admin can read all profiles
CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- Admin can read all rides
CREATE POLICY "admin_read_all_rides" ON rides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- Admin can read all remittances
CREATE POLICY "admin_read_all_remittances" ON remittances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
```

---

## File Map

**New:**
- `supabase/functions/admin-verify-rider/index.ts`
- `supabase/functions/admin-review-remittance/index.ts`
- `supabase/functions/admin-block-user/index.ts`
- `src/lib/adminService.ts`
- `src/screens/admin/AdminProfileScreen.tsx`
- `src/screens/admin/AdminLiveScreen.tsx`
- `src/screens/admin/RiderVerificationScreen.tsx`
- `src/screens/admin/AdminRemittancesScreen.tsx`
- `src/screens/admin/UserBlockingScreen.tsx`
- `src/navigation/AdminNavigator.tsx`

**Modified:**
- `src/lib/supabase.ts` — extend Profile type
- `App.tsx` — route admin/super_admin to AdminNavigator

---

## Task 1: Extend Profile type

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Add missing fields to Profile interface**

Open `src/lib/supabase.ts`. Replace the existing `Profile` interface with:

```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_photo_url: string | null;
  role: UserRole;
  onboarded: boolean;
  profile_completed: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birthday: string | null;
  sex: string | null;
  rider_status: RiderStatus | null;
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_type: string | null;
  vehicle_image_url: string | null;
  or_url: string | null;
  cr_url: string | null;
  license_url: string | null;
  expo_push_token: string | null;
  // Admin
  admin_role_ids: string[];
  // Blocking
  is_blocked: boolean;
  block_reason: string | null;
  blocked_by: string | null;
  blocked_at: string | null;
  // Rider verification
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to Profile).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat(admin): extend Profile type with admin/blocking/verification fields"
```

---

## Task 2: Create adminService.ts

**Files:**
- Create: `src/lib/adminService.ts`

- [ ] **Step 1: Create the file**

```typescript
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

async function callAdminFn(name: string, body: object): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Admin operation failed');
  }
}

export const verifyRider = (
  riderId: string,
  status: 'approved' | 'rejected' | 'pending',
) => callAdminFn('admin-verify-rider', { riderId, status });

export const reviewRemittance = (
  id: string,
  status: 'approved' | 'rejected',
  notes?: string,
) => callAdminFn('admin-review-remittance', { id, status, notes });

export const blockUser = (
  userId: string,
  reason: string,
  blockedByName: string,
) => callAdminFn('admin-block-user', { action: 'block', userId, reason, blockedByName });

export const unblockUser = (userId: string) =>
  callAdminFn('admin-block-user', { action: 'unblock', userId });
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/adminService.ts
git commit -m "feat(admin): add adminService Edge Function callers"
```

---

## Task 3: Create Edge Functions

**Files:**
- Create: `supabase/functions/admin-verify-rider/index.ts`
- Create: `supabase/functions/admin-review-remittance/index.ts`
- Create: `supabase/functions/admin-block-user/index.ts`

- [ ] **Step 1: Create shared CORS helper inline — admin-verify-rider**

Create `supabase/functions/admin-verify-rider/index.ts`:

```typescript
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function verifyAdminRole(authHeader: string): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = await getAdminClient()
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!data || !['admin', 'super_admin'].includes(data.role)) return null
  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const adminId = await verifyAdminRole(authHeader)
    if (!adminId) return json({ error: 'Forbidden' }, 403)

    const { riderId, status } = await req.json()
    if (!riderId || !['approved', 'rejected', 'pending'].includes(status)) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const admin = await getAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({
        rider_status: status,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', riderId)

    if (error) throw error
    return json({ success: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
```

- [ ] **Step 2: Create admin-review-remittance**

Create `supabase/functions/admin-review-remittance/index.ts`:

```typescript
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function verifyAdminRole(authHeader: string): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!data || !['admin', 'super_admin'].includes(data.role)) return null
  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const adminId = await verifyAdminRole(authHeader)
    if (!adminId) return json({ error: 'Forbidden' }, 403)

    const { id, status, notes } = await req.json()
    if (!id || !['approved', 'rejected'].includes(status)) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await admin
      .from('remittances')
      .update({
        status,
        admin_notes: notes ?? null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error
    return json({ success: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
```

- [ ] **Step 3: Create admin-block-user**

Create `supabase/functions/admin-block-user/index.ts`:

```typescript
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function verifyAdminRole(authHeader: string): Promise<{ adminId: string; adminName: string } | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await admin.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!data || !['admin', 'super_admin'].includes(data.role)) return null
  return { adminId: user.id, adminName: data.full_name ?? 'Admin' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = await verifyAdminRole(authHeader)
    if (!caller) return json({ error: 'Forbidden' }, 403)

    const { action, userId, reason } = await req.json()
    if (!userId || !['block', 'unblock'].includes(action)) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const updates = action === 'block'
      ? {
          is_blocked: true,
          block_reason: reason ?? null,
          blocked_by: caller.adminName,
          blocked_at: new Date().toISOString(),
        }
      : {
          is_blocked: false,
          block_reason: null,
          blocked_by: null,
          blocked_at: null,
        }

    const { error } = await admin.from('profiles').update(updates).eq('id', userId)
    if (error) throw error
    return json({ success: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat(admin): add Edge Functions for verify-rider, review-remittance, block-user"
```

---

## Task 4: AdminProfileScreen

**Files:**
- Create: `src/screens/admin/AdminProfileScreen.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image,
} from 'react-native';
import { useProfile } from '../../contexts/AuthContext';

export default function AdminProfileScreen() {
  const { profile, signOut } = useProfile();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.title}>Admin Profile</Text>

        <View style={s.card}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarInitial}>
                {(profile.full_name ?? profile.email)[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={s.name}>{profile.full_name ?? '—'}</Text>
          <Text style={s.email}>{profile.email}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{profile.role.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 24,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  email: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  badge: {
    backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#059669', letterSpacing: 0.5 },
  signOutBtn: {
    backgroundColor: '#ef4444', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/admin/AdminProfileScreen.tsx
git commit -m "feat(admin): add AdminProfileScreen"
```

---

## Task 5: AdminLiveScreen

**Files:**
- Create: `src/screens/admin/AdminLiveScreen.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, SafeAreaView, RefreshControl, ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/supabase';

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

  const onRefresh = () => { setRefreshing(true); load(); };

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        ListHeaderComponent={() => (
          <>
            <Text style={s.pageTitle}>Live Operations</Text>

            {/* Stats row */}
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

            {/* Online riders */}
            <Text style={s.sectionTitle}>Online Riders ({onlineRiders.length})</Text>
            {onlineRiders.length === 0 && (
              <Text style={s.empty}>No riders online</Text>
            )}
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
            {ongoingRides.length === 0 && (
              <Text style={s.empty}>No active rides</Text>
            )}
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
            <Text style={s.rideRoute} numberOfLines={1}>
              {item.pickup}
            </Text>
            <Text style={s.rideArrow}>→</Text>
            <Text style={s.rideRoute} numberOfLines={1}>
              {item.dropoff}
            </Text>
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
  rideId: { fontSize: 11, fontWeight: '600', color: '#9ca3af', fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  rideRoute: { fontSize: 13, color: '#374151' },
  rideArrow: { fontSize: 11, color: '#9ca3af', marginVertical: 2 },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/admin/AdminLiveScreen.tsx
git commit -m "feat(admin): add AdminLiveScreen with stats and ongoing rides"
```

---

## Task 6: RiderVerificationScreen

**Files:**
- Create: `src/screens/admin/RiderVerificationScreen.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { verifyRider } from '../../lib/adminService';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  unsubmitted: '#9ca3af',
};

export default function RiderVerificationScreen() {
  const [riders, setRiders] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    let q = supabase
      .from('profiles')
      .select('*')
      .in('role', ['rider', 'team_leader'])
      .order('created_at', { ascending: false });

    const { data } = await q;
    setRiders((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = riders.filter(r => {
    const matchStatus = filter === 'all' || r.rider_status === filter;
    const matchSearch = !search || (r.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleVerify = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!selected) return;
    Alert.alert(
      `${status.charAt(0).toUpperCase() + status.slice(1)} Rider`,
      `Set ${selected.full_name ?? selected.email} status to ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setSubmitting(true);
            try {
              await verifyRider(selected.id, status);
              setSelected(null);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Rider Verification</Text>
        <TextInput
          style={s.search}
          placeholder="Search by name or email…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterBtn, filter === f && s.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${riders.filter(r => r.rider_status === f).length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              <View style={s.avatarBox}>
                {item.avatar_url
                  ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                  : <View style={s.avatarPlaceholder}><Text style={s.avatarInitial}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.sub}>{item.email}</Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.rider_status ?? 'unsubmitted']) + '20' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.rider_status ?? 'unsubmitted'] }]}>
                    {item.rider_status ?? 'unsubmitted'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.reviewBtn} onPress={() => setSelected(item)}>
                <Text style={s.reviewBtnText}>Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No riders found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Review Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Review Application</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Personal info */}
              <Text style={s.sectionLabel}>PERSONAL INFO</Text>
              <View style={s.infoCard}>
                <Row label="Name" value={selected.full_name ?? '—'} />
                <Row label="Email" value={selected.email} />
                <Row label="Phone" value={selected.phone ?? '—'} />
                <Row label="Status">
                  <View style={[s.badge, { backgroundColor: (STATUS_COLOR[selected.rider_status ?? 'unsubmitted']) + '20' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[selected.rider_status ?? 'unsubmitted'] }]}>
                      {selected.rider_status ?? 'unsubmitted'}
                    </Text>
                  </View>
                </Row>
                {selected.reviewed_by_name && (
                  <Row label="Reviewed by" value={`${selected.reviewed_by_name} • ${selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleDateString() : ''}`} />
                )}
              </View>

              {/* Vehicle info */}
              <Text style={s.sectionLabel}>VEHICLE</Text>
              <View style={s.infoCard}>
                <Row label="Type" value={selected.vehicle_type ?? '—'} />
                <Row label="Make/Model" value={[selected.vehicle_make, selected.vehicle_model].filter(Boolean).join(' ') || '—'} />
                <Row label="Plate" value={selected.vehicle_plate ?? '—'} />
                <Row label="Color" value={selected.vehicle_color ?? '—'} />
              </View>

              {/* Documents */}
              <Text style={s.sectionLabel}>DOCUMENTS</Text>
              <View style={s.docsRow}>
                {[
                  { label: "Driver's License", url: selected.license_url },
                  { label: 'OR', url: selected.or_url },
                  { label: 'CR', url: selected.cr_url },
                  { label: 'Vehicle Photo', url: selected.vehicle_image_url },
                ].map(doc => (
                  <View key={doc.label} style={s.docBox}>
                    <Text style={s.docLabel}>{doc.label}</Text>
                    {doc.url
                      ? <Image source={{ uri: doc.url }} style={s.docImg} resizeMode="cover" />
                      : <View style={s.docPlaceholder}><Text style={s.docPlaceholderText}>No file</Text></View>
                    }
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#10b981' }, submitting && s.disabled]}
                  disabled={submitting}
                  onPress={() => handleVerify('approved')}
                >
                  <Text style={s.actionBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#ef4444' }, submitting && s.disabled]}
                  disabled={submitting}
                  onPress={() => handleVerify('rejected')}
                >
                  <Text style={s.actionBtnText}>Reject</Text>
                </TouchableOpacity>
                {(selected.rider_status === 'approved' || selected.rider_status === 'rejected') && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#f59e0b' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleVerify('pending')}
                  >
                    <Text style={s.actionBtnText}>Reset to Pending</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {children ?? <Text style={s.rowValue}>{value}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  search: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 10,
  },
  filterRow: { marginBottom: 8 },
  filterContent: { gap: 8, paddingRight: 4 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent',
  },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarBox: {},
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712' },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  reviewBtn: { backgroundColor: '#030712', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  reviewBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#030712', flex: 2, textAlign: 'right' },
  docsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  docBox: { width: '47%' },
  docLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  docImg: { width: '100%', height: 100, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  docPlaceholder: { width: '100%', height: 100, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  docPlaceholderText: { fontSize: 12, color: '#9ca3af' },
  actions: { gap: 10, marginTop: 24 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/admin/RiderVerificationScreen.tsx
git commit -m "feat(admin): add RiderVerificationScreen"
```

---

## Task 7: AdminRemittancesScreen

**Files:**
- Create: `src/screens/admin/AdminRemittancesScreen.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Remittance } from '../../lib/remittanceService';
import { reviewRemittance } from '../../lib/adminService';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
const FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
};

export default function AdminRemittancesScreen() {
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Remittance | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('remittances')
      .select('*')
      .order('remittance_date', { ascending: false })
      .limit(100);
    setRemittances((data ?? []) as Remittance[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? remittances : remittances.filter(r => r.status === filter);

  const openReview = (item: Remittance) => {
    setSelected(item);
    setNotes(item.admin_notes ?? '');
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await reviewRemittance(selected.id, status, notes.trim() || undefined);
      setSelected(null);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Remittances</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${remittances.filter(r => r.status === f).length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.riderName}>{item.rider_name ?? item.rider_id.slice(0, 8)}</Text>
                <Text style={s.sub}>{item.remittance_date}</Text>
                <Text style={s.fare}>Due: ₱{item.total_booking_fee.toFixed(2)} · Remitted: ₱{item.amount_remitted.toFixed(2)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <View style={[s.badge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
                </View>
                <TouchableOpacity style={s.reviewBtn} onPress={() => openReview(item)}>
                  <Text style={s.reviewBtnText}>Review</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No remittances found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Review Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Review Remittance</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>SUMMARY</Text>
              <View style={s.infoCard}>
                <MRow label="Rider" value={selected.rider_name ?? selected.rider_id.slice(0, 8)} />
                <MRow label="Date" value={selected.remittance_date} />
                <MRow label="Rides" value={String(selected.rides_count ?? 0)} />
                <MRow label="Total Earnings" value={`₱${selected.total_earnings.toFixed(2)}`} />
                <MRow label="Booking Fee Due" value={`₱${selected.total_booking_fee.toFixed(2)}`} />
                <MRow label="Amount Remitted" value={`₱${selected.amount_remitted.toFixed(2)}`} />
                <MRow label="Status">
                  <View style={[s.badge, { backgroundColor: STATUS_COLOR[selected.status] + '20' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[selected.status] }]}>{selected.status}</Text>
                  </View>
                </MRow>
              </View>

              {/* Receipt */}
              {selected.receipt_url && (
                <>
                  <Text style={s.sectionLabel}>RECEIPT</Text>
                  <TouchableOpacity onPress={() => setReceiptVisible(true)}>
                    <Image source={{ uri: selected.receipt_url }} style={s.receiptThumb} resizeMode="cover" />
                    <Text style={s.tapHint}>Tap to view full size</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Notes */}
              <Text style={s.sectionLabel}>ADMIN NOTES</Text>
              <TextInput
                style={s.notesInput}
                placeholder="Optional notes…"
                placeholderTextColor="#9ca3af"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />

              {selected.status === 'pending' && (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#10b981' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleReview('approved')}
                  >
                    <Text style={s.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#ef4444' }, submitting && s.disabled]}
                    disabled={submitting}
                    onPress={() => handleReview('rejected')}
                  >
                    <Text style={s.actionBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Receipt fullscreen */}
      <Modal visible={receiptVisible} animationType="fade" onRequestClose={() => setReceiptVisible(false)}>
        <View style={s.receiptFull}>
          <TouchableOpacity style={s.receiptClose} onPress={() => setReceiptVisible(false)}>
            <Text style={s.receiptCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {selected?.receipt_url && (
            <Image source={{ uri: selected.receipt_url }} style={s.receiptFullImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {children ?? <Text style={s.rowValue}>{value}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  filterRow: { marginBottom: 8 },
  filterContent: { gap: 8, paddingRight: 4 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderName: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  sub: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  fare: { fontSize: 12, color: '#6b7280' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  reviewBtn: { backgroundColor: '#030712', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  reviewBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#030712', flex: 2, textAlign: 'right' },
  receiptThumb: { width: '100%', height: 180, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 4 },
  tapHint: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 8 },
  notesInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top',
  },
  actions: { gap: 10, marginTop: 24 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
  receiptFull: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  receiptClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  receiptCloseText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  receiptFullImg: { width: '100%', height: '80%' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/admin/AdminRemittancesScreen.tsx
git commit -m "feat(admin): add AdminRemittancesScreen"
```

---

## Task 8: UserBlockingScreen

**Files:**
- Create: `src/screens/admin/UserBlockingScreen.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Image, Alert, TextInput,
} from 'react-native';
import { supabase, Profile } from '../../lib/supabase';
import { blockUser, unblockUser } from '../../lib/adminService';
import { useProfile } from '../../contexts/AuthContext';

type RoleFilter = 'all' | 'user' | 'rider';
type BlockFilter = 'all' | 'blocked' | 'active';

export default function UserBlockingScreen() {
  const { profile: adminProfile } = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [blockFilter, setBlockFilter] = useState<BlockFilter>('all');
  const [blockTarget, setBlockTarget] = useState<Profile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [unblockTarget, setUnblockTarget] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['user', 'rider', 'team_leader'])
      .order('created_at', { ascending: false })
      .limit(200);
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (blockFilter === 'blocked' && !u.is_blocked) return false;
    if (blockFilter === 'active' && u.is_blocked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.full_name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const handleBlock = async () => {
    if (!blockTarget) return;
    if (!blockReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for blocking.');
      return;
    }
    setSubmitting(true);
    try {
      await blockUser(blockTarget.id, blockReason.trim(), adminProfile.full_name ?? 'Admin');
      setBlockTarget(null);
      setBlockReason('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblock = async () => {
    if (!unblockTarget) return;
    setSubmitting(true);
    try {
      await unblockUser(unblockTarget.id);
      setUnblockTarget(null);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>User Blocking</Text>
        <TextInput
          style={s.search}
          placeholder="Search name or email…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
          {(['all', 'user', 'rider'] as RoleFilter[]).map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, roleFilter === f && s.filterBtnActive]} onPress={() => setRoleFilter(f)}>
              <Text style={[s.filterText, roleFilter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
          <View style={s.divider} />
          {(['all', 'active', 'blocked'] as BlockFilter[]).map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, blockFilter === f && (f === 'blocked' ? s.filterBtnDanger : s.filterBtnActive)]} onPress={() => setBlockFilter(f)}>
              <Text style={[s.filterText, blockFilter === f && (f === 'blocked' ? s.filterTextDanger : s.filterTextActive)]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={[s.card, item.is_blocked && s.cardBlocked]}>
            <View style={s.cardRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                : <View style={s.avatarPlaceholder}><Text style={s.avatarInitial}>{(item.full_name ?? item.email)[0].toUpperCase()}</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name ?? '—'}</Text>
                <Text style={s.sub}>{item.email}</Text>
                <View style={s.badgeRow}>
                  <View style={s.roleBadge}><Text style={s.roleBadgeText}>{item.role}</Text></View>
                  {item.is_blocked && <View style={s.blockedBadge}><Text style={s.blockedBadgeText}>Blocked</Text></View>}
                </View>
                {item.is_blocked && item.block_reason && (
                  <Text style={s.blockReason} numberOfLines={1}>Reason: {item.block_reason}</Text>
                )}
              </View>
              {item.is_blocked
                ? (
                  <TouchableOpacity style={s.unblockBtn} onPress={() => setUnblockTarget(item)}>
                    <Text style={s.unblockBtnText}>Unblock</Text>
                  </TouchableOpacity>
                )
                : (
                  <TouchableOpacity style={s.blockBtn} onPress={() => { setBlockTarget(item); setBlockReason(''); }}>
                    <Text style={s.blockBtnText}>Block</Text>
                  </TouchableOpacity>
                )
              }
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No users found</Text>}
        contentContainerStyle={s.list}
      />

      {/* Block Modal */}
      <Modal visible={!!blockTarget} animationType="slide" transparent onRequestClose={() => setBlockTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Block User</Text>
            <Text style={s.sheetSub}>{blockTarget?.full_name ?? blockTarget?.email}</Text>
            <Text style={s.sheetLabel}>Reason (required)</Text>
            <TextInput
              style={s.reasonInput}
              placeholder="Enter reason for blocking…"
              placeholderTextColor="#9ca3af"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setBlockTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBlockBtn, submitting && s.disabled]}
                disabled={submitting}
                onPress={handleBlock}
              >
                <Text style={s.confirmBlockBtnText}>Block User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unblock Confirm */}
      <Modal visible={!!unblockTarget} animationType="slide" transparent onRequestClose={() => setUnblockTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Unblock User</Text>
            <Text style={s.sheetSub}>{unblockTarget?.full_name ?? unblockTarget?.email}</Text>
            <Text style={s.sheetNote}>This will restore full platform access for this user.</Text>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setUnblockTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmUnblockBtn, submitting && s.disabled]}
                disabled={submitting}
                onPress={handleUnblock}
              >
                <Text style={s.confirmBlockBtnText}>Confirm Unblock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginBottom: 12 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', marginBottom: 10 },
  filtersRow: { gap: 8, paddingRight: 4, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterBtnDanger: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  filterTextDanger: { color: '#ef4444' },
  divider: { width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 4 },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardBlocked: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 14, fontWeight: '700', color: '#030712', marginBottom: 2 },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  roleBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  blockedBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  blockedBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  blockReason: { fontSize: 11, color: '#ef4444', marginTop: 4 },
  blockBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  blockBtnText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  unblockBtn: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#6ee7b7' },
  unblockBtnText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#030712', marginBottom: 4 },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  sheetLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  sheetNote: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  reasonInput: { backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  sheetActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBlockBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmUnblockBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#10b981' },
  confirmBlockBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/admin/UserBlockingScreen.tsx
git commit -m "feat(admin): add UserBlockingScreen"
```

---

## Task 9: AdminNavigator + App.tsx routing

**Files:**
- Create: `src/navigation/AdminNavigator.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Create AdminNavigator**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AdminLiveScreen from '../screens/admin/AdminLiveScreen';
import RiderVerificationScreen from '../screens/admin/RiderVerificationScreen';
import AdminRemittancesScreen from '../screens/admin/AdminRemittancesScreen';
import UserBlockingScreen from '../screens/admin/UserBlockingScreen';
import AdminProfileScreen from '../screens/admin/AdminProfileScreen';

const Tab = createBottomTabNavigator();
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TabIcon = ({ icon, label, focused }: { icon: IoniconsName; label: string; focused: boolean }) => (
  <View style={t.iconWrap}>
    <Ionicons name={icon} size={22} color={focused ? '#030712' : '#9ca3af'} />
    <Text style={[t.label, focused && t.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </View>
);

export default function AdminNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: t.bar, tabBarShowLabel: false }}>
      <Tab.Screen
        name="AdminLive"
        component={AdminLiveScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'radio' : 'radio-outline'} label="Live" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminVerify"
        component={RiderVerificationScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} label="Verify" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminRemit"
        component={AdminRemittancesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'cash' : 'cash-outline'} label="Remit" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminBlocking"
        component={UserBlockingScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'ban' : 'ban-outline'} label="Blocking" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'person' : 'person-outline'} label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

const t = StyleSheet.create({
  bar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', height: 72, paddingBottom: 8, paddingTop: 8, elevation: 0, shadowOpacity: 0 },
  iconWrap: { alignItems: 'center', justifyContent: 'center', gap: 2, width: 60 },
  label: { fontSize: 9, fontWeight: '600', color: '#9ca3af', textAlign: 'center' },
  labelActive: { color: '#030712' },
});
```

- [ ] **Step 2: Update App.tsx routing**

In `App.tsx`, add the import at the top (after existing imports):

```typescript
import AdminNavigator from './src/navigation/AdminNavigator';
```

Then replace:

```typescript
const isRider = profile.role === 'rider' || profile.role === 'team_leader';

return (
  <AuthProvider value={{ profile, signOut, refetchProfile }}>
    <NavigationContainer>
      {isRider ? <RiderNavigator appSettings={appSettings} /> : <UserNavigator />}
    </NavigationContainer>
  </AuthProvider>
);
```

With:

```typescript
const isRider = profile.role === 'rider' || profile.role === 'team_leader';
const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';

return (
  <AuthProvider value={{ profile, signOut, refetchProfile }}>
    <NavigationContainer>
      {isAdmin
        ? <AdminNavigator />
        : isRider
        ? <RiderNavigator appSettings={appSettings} />
        : <UserNavigator />}
    </NavigationContainer>
  </AuthProvider>
);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/AdminNavigator.tsx App.tsx
git commit -m "feat(admin): add AdminNavigator and wire admin routing in App.tsx"
```

---

## Done — Phase 1 Complete

After these tasks, any user with `role = 'admin'` or `role = 'super_admin'` in Supabase will land on the AdminNavigator with 5 tabs: Live, Verify, Remit, Blocking, Profile.

**Deploy Edge Functions:**
```bash
supabase functions deploy admin-verify-rider
supabase functions deploy admin-review-remittance
supabase functions deploy admin-block-user
```

**Phase 2 modules** (Driver Management, Team Management, News Feed) follow the same pattern — new screens added to AdminNavigator as tabs.
