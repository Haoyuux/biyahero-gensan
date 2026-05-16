# Mobile Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port 5 missing service files from the web app and wire them into all mobile screens, voucher UI, app settings gating, ride persistence, and push notifications — in 6 independently pauseable phases.

**Architecture:** Each phase ends with a commit and leaves the app fully working. All Supabase calls use only the regular anon-key client — RLS policies on the DB handle authorization. New services live in `src/lib/`; screens import from there instead of calling `supabase` directly.

**Tech Stack:** React Native, Expo SDK 54, @supabase/supabase-js v2, AsyncStorage, expo-image-picker, expo-notifications

---

## File Map

| Phase | Action | File |
|-------|--------|------|
| 1 | Create | `src/lib/voucherService.ts` |
| 1 | Create | `src/lib/settingsService.ts` |
| 1 | Create | `src/lib/newsService.ts` |
| 1 | Create | `src/lib/remittanceService.ts` |
| 1 | Create | `src/lib/teamService.ts` |
| 2 | Modify | `src/screens/rider/NewsScreen.tsx` |
| 2 | Modify | `src/screens/rider/RemitScreen.tsx` |
| 2 | Modify | `src/screens/rider/TeamScreen.tsx` |
| 3 | Modify | `src/screens/user/HomeScreen.tsx` |
| 4 | Modify | `App.tsx` |
| 4 | Modify | `src/navigation/RiderNavigator.tsx` |
| 5 | Modify | `src/screens/user/HomeScreen.tsx` |
| 5 | Modify | `src/screens/rider/RiderHomeScreen.tsx` |
| 6 | Modify | `src/screens/rider/RiderHomeScreen.tsx` |

---

## ━━━ PHASE 1: Service Layer ━━━

> **Pause point:** After the commit at the end of Phase 1 the app is unchanged — these are new files only.

---

### Task 1.1: Create voucherService.ts

**Files:**
- Create: `src/lib/voucherService.ts`

- [ ] **Step 1: Create the file**

`src/lib/voucherService.ts`:
```typescript
import { supabase } from './supabase';
import type { FareBreakdown } from './fareService';

export type VoucherDiscountType = 'percentage' | 'fixed';
export type UserVoucherStatus = 'available' | 'used' | 'expired';

export interface Voucher {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discount_type: VoucherDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  minimum_fare: number;
  minimum_distance_km: number;
  usage_limit: number | null;
  per_user_limit: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserVoucher {
  id: string;
  user_id: string;
  voucher_id: string;
  code: string;
  status: UserVoucherStatus;
  added_at: string;
  used_at: string | null;
  ride_id: string | null;
  voucher?: Voucher;
}

export interface VoucherQuote {
  voucher: Voucher;
  discount: number;
  finalFare: number;
  reason?: string;
}

export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function isVoucherInWindow(voucher: Voucher, now = new Date()): boolean {
  if (!voucher.is_active) return false;
  if (voucher.starts_at && now < new Date(voucher.starts_at)) return false;
  if (voucher.expires_at && now > new Date(voucher.expires_at)) return false;
  return true;
}

export function calculateVoucherDiscount(voucher: Voucher, fare: number): number {
  const raw =
    voucher.discount_type === 'percentage'
      ? fare * (voucher.discount_value / 100)
      : voucher.discount_value;
  const capped =
    voucher.discount_type === 'percentage' && voucher.max_discount_amount != null
      ? Math.min(raw, voucher.max_discount_amount)
      : raw;
  return Math.max(0, Math.min(fare, Math.round(capped)));
}

export function getVoucherRideIssue(
  voucher: Voucher,
  fare: number,
  distanceKm: number,
): string | null {
  if (!isVoucherInWindow(voucher)) {
    if (!voucher.is_active) return 'Voucher is inactive';
    if (voucher.starts_at && new Date() < new Date(voucher.starts_at)) return 'Voucher not active yet';
    return 'Voucher is expired';
  }
  if (voucher.minimum_fare > fare) return `Requires minimum fare of ₱${voucher.minimum_fare}`;
  if (voucher.minimum_distance_km > distanceKm) return `Requires ${voucher.minimum_distance_km} km or more`;
  return null;
}

export function quoteVoucher(voucher: Voucher, breakdown: FareBreakdown): VoucherQuote {
  const reason = getVoucherRideIssue(voucher, breakdown.totalFare, breakdown.distanceKm);
  const discount = reason ? 0 : calculateVoucherDiscount(voucher, breakdown.totalFare);
  return {
    voucher,
    discount,
    finalFare: Math.max(0, breakdown.totalFare - discount),
    reason: reason ?? undefined,
  };
}

export async function fetchUserVouchers(userId: string): Promise<UserVoucher[]> {
  const { data, error } = await supabase
    .from('user_vouchers')
    .select('*, voucher:vouchers(*)')
    .eq('user_id', userId)
    .eq('status', 'available')
    .order('added_at', { ascending: false });
  if (error) { console.error('fetchUserVouchers:', error); return []; }
  return (data as UserVoucher[]) ?? [];
}

export async function addVoucherToUser(
  userId: string,
  rawCode: string,
): Promise<{ userVoucher: UserVoucher | null; error?: string }> {
  const code = normalizeVoucherCode(rawCode);
  if (!code) return { userVoucher: null, error: 'Enter a voucher code' };

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error || !voucher) return { userVoucher: null, error: 'Voucher code not found' };

  const v = voucher as Voucher;
  if (!isVoucherInWindow(v)) return { userVoucher: null, error: 'Voucher is not available' };

  const { data: existing } = await supabase
    .from('user_vouchers')
    .select('*, voucher:vouchers(*)')
    .eq('user_id', userId)
    .eq('voucher_id', v.id)
    .eq('status', 'available')
    .maybeSingle();
  if (existing) return { userVoucher: existing as UserVoucher };

  const { data, error: insertError } = await supabase
    .from('user_vouchers')
    .insert({ user_id: userId, voucher_id: v.id, code: v.code, status: 'available' })
    .select('*, voucher:vouchers(*)')
    .single();
  if (insertError) return { userVoucher: null, error: insertError.message || 'Unable to add voucher' };
  return { userVoucher: data as UserVoucher };
}

export async function markVoucherUsed(
  userVoucherId: string,
  rideId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_vouchers')
    .update({ status: 'used', used_at: new Date().toISOString(), ride_id: rideId })
    .eq('id', userVoucherId);
  if (error) console.error('markVoucherUsed:', error);
  return !error;
}
```

---

### Task 1.2: Create settingsService.ts

**Files:**
- Create: `src/lib/settingsService.ts`

- [ ] **Step 1: Create the file**

`src/lib/settingsService.ts`:
```typescript
import { supabase } from './supabase';

export interface AppSettings {
  id: number;
  app_name: string;
  document_title: string | null;
  app_logo_url: string | null;
  remittance_qr_url: string | null;
  remittance_enabled: boolean;
  maintenance_mode: 'off' | 'half' | 'full';
  maintenance_message: string | null;
  updated_at: string;
}

export async function getAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) { console.error('getAppSettings:', error); return null; }
  return data as AppSettings;
}
```

---

### Task 1.3: Create newsService.ts

**Files:**
- Create: `src/lib/newsService.ts`

- [ ] **Step 1: Create the file**

`src/lib/newsService.ts`:
```typescript
import { supabase } from './supabase';

export const NEWS_CATEGORIES = ['Announcement', 'Update', 'Promo', 'Event', 'Important'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  category: string;
  author_name: string;
  author_avatar: string | null;
  published: boolean;
  is_archived: boolean;
  created_at: string;
}

export async function fetchNewsPosts(): Promise<NewsPost[]> {
  const { data, error } = await supabase
    .from('news_posts')
    .select('id, title, content, image_url, category, author_name, author_avatar, published, is_archived, created_at')
    .eq('published', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('fetchNewsPosts:', error); return []; }
  return (data as NewsPost[]) ?? [];
}
```

---

### Task 1.4: Create remittanceService.ts

**Files:**
- Create: `src/lib/remittanceService.ts`

- [ ] **Step 1: Create the file**

Note: `uploadReceipt` accepts a local file URI from `expo-image-picker` (not a browser `File` object). It uses `fetch` to get the blob then uploads to Supabase Storage.

`src/lib/remittanceService.ts`:
```typescript
import { supabase } from './supabase';

export interface Remittance {
  id: string;
  rider_id: string;
  rider_name: string | null;
  rider_avatar: string | null;
  remittance_date: string;
  total_earnings: number;
  total_booking_fee: number;
  amount_remitted: number;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  rides_count: number;
}

export async function getRiderRemittances(
  riderId: string,
  dateFilter?: string,
): Promise<Remittance[]> {
  let query = supabase
    .from('remittances')
    .select('*')
    .eq('rider_id', riderId)
    .order('remittance_date', { ascending: false });
  if (dateFilter) query = query.eq('remittance_date', dateFilter);
  const { data } = await query;
  return (data as Remittance[]) ?? [];
}

export async function getRiderDailyStats(
  riderId: string,
  date: string,
): Promise<{ rides: any[]; totalEarnings: number; totalBookingFee: number; ridesCount: number }> {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const { data } = await supabase
    .from('rides')
    .select('id, fare, fare_breakdown, completed_at')
    .eq('rider_id', riderId)
    .eq('status', 'completed')
    .gte('completed_at', dayStart)
    .lte('completed_at', dayEnd)
    .order('completed_at', { ascending: false });
  const rides = data ?? [];
  const totalEarnings = rides.reduce((sum, r) => sum + (r.fare ?? 0), 0);
  const totalBookingFee = rides.reduce((sum, r) => sum + (r.fare_breakdown?.bookingFee ?? 0), 0);
  return { rides, totalEarnings, totalBookingFee, ridesCount: rides.length };
}

/** uri: local file URI from expo-image-picker (e.g. "file:///...") */
export async function uploadReceipt(riderId: string, uri: string): Promise<string | null> {
  try {
    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `remittances/${riderId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, blob, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
    if (error) { console.error('uploadReceipt:', error); return null; }
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error('uploadReceipt:', e);
    return null;
  }
}

export async function createRemittance(
  riderId: string,
  riderName: string,
  riderAvatar: string | null,
  date: string,
  totalEarnings: number,
  totalBookingFee: number,
  amountRemitted: number,
  receiptUrl: string,
  ridesCount: number,
): Promise<Remittance | null> {
  const { data, error } = await supabase
    .from('remittances')
    .insert({
      rider_id: riderId,
      rider_name: riderName,
      rider_avatar: riderAvatar,
      remittance_date: date,
      total_earnings: totalEarnings,
      total_booking_fee: totalBookingFee,
      amount_remitted: amountRemitted,
      receipt_url: receiptUrl,
      rides_count: ridesCount,
      status: 'pending',
    })
    .select()
    .single();
  if (error) { console.error('createRemittance:', error); return null; }
  return data as Remittance;
}

export async function getTeamRemittances(
  riderIds: string[],
  dateFilter?: string,
): Promise<Remittance[]> {
  if (!riderIds.length) return [];
  let query = supabase
    .from('remittances')
    .select('*')
    .in('rider_id', riderIds)
    .order('remittance_date', { ascending: false });
  if (dateFilter) query = query.eq('remittance_date', dateFilter);
  const { data } = await query;
  return (data as Remittance[]) ?? [];
}
```

---

### Task 1.5: Create teamService.ts

**Files:**
- Create: `src/lib/teamService.ts`

- [ ] **Step 1: Create the file**

`src/lib/teamService.ts`:
```typescript
import { supabase } from './supabase';

export interface TeamMember {
  id: string;
  team_id: string;
  rider_id: string;
  joined_at: string;
  rider?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
    rider_status: string | null;
  };
}

export interface Team {
  id: string;
  name: string;
  capacity: number;
  schedule_days: number[];
  is_active: boolean;
  leader_id: string | null;
  created_at: string;
  members?: TeamMember[];
}

const TEAM_SELECT = 'id, name, capacity, schedule_days, is_active, leader_id, created_at';
const MEMBER_SELECT = `id, team_id, rider_id, joined_at, rider:profiles!team_members_rider_id_fkey(id, full_name, first_name, last_name, avatar_url, is_online, rider_status)`;

export async function fetchMyTeam(leaderId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('leader_id', leaderId)
    .maybeSingle();
  return (data as unknown as Team) ?? null;
}

export async function fetchTeamWithMembers(teamId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('teams')
    .select(`${TEAM_SELECT}, members:team_members(${MEMBER_SELECT})`)
    .eq('id', teamId)
    .single();
  return (data as unknown as Team) ?? null;
}

export async function fetchRiderMembership(riderId: string): Promise<Team | null> {
  const { data } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('rider_id', riderId)
    .maybeSingle();
  if (!data?.team_id) return null;
  const { data: team } = await supabase
    .from('teams')
    .select(TEAM_SELECT)
    .eq('id', data.team_id)
    .maybeSingle();
  return (team as unknown as Team) ?? null;
}

export async function addTeamMember(teamId: string, riderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, rider_id: riderId });
  if (error) console.error('addTeamMember:', error);
  return !error;
}

export async function removeTeamMember(teamId: string, riderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('rider_id', riderId);
  return !error;
}
```

---

### Task 1.6: Commit Phase 1

- [ ] **Step 1: Stage and commit**

```bash
git add src/lib/voucherService.ts src/lib/settingsService.ts src/lib/newsService.ts src/lib/remittanceService.ts src/lib/teamService.ts
git commit -m "feat: add mobile service layer (voucher, settings, news, remittance, team)"
```

**✅ PHASE 1 COMPLETE — safe to pause here**

---

## ━━━ PHASE 2: Wire Rider Screens to Services ━━━

> **Pause point:** After commit at end of Phase 2. Requires Phase 1 to be done first.

---

### Task 2.1: Wire NewsScreen to newsService

**Files:**
- Modify: `src/screens/rider/NewsScreen.tsx`

- [ ] **Step 1: Replace inline query with service call**

In `NewsScreen.tsx`:

1. Add import at top (replace the `supabase` import):
```typescript
import { fetchNewsPosts, NewsPost } from '../../lib/newsService';
```

2. Remove the local `NewsPost` interface (it's now imported).

3. Replace the `fetchPosts` function body:
```typescript
const fetchPosts = async () => {
  const data = await fetchNewsPosts();
  setPosts(data);
};
```

4. Remove the `import { supabase } from '../../lib/supabase';` line if no longer used.

- [ ] **Step 2: Verify**

Run `npm start`, open the News tab — posts should still load exactly as before.

---

### Task 2.2: Wire RemitScreen to remittanceService

**Files:**
- Modify: `src/screens/rider/RemitScreen.tsx`

- [ ] **Step 1: Read the full current file**

Run: `cat src/screens/rider/RemitScreen.tsx`

Identify every place that calls `supabase.from('rides')` or `supabase.from('remittances')`.

- [ ] **Step 2: Add service imports**

At the top of `RemitScreen.tsx`, add:
```typescript
import {
  getRiderDailyStats,
  getRiderRemittances,
  createRemittance,
  uploadReceipt,
  Remittance,
} from '../../lib/remittanceService';
```

Remove the local `Remittance` interface and `DailyStats` interface.

- [ ] **Step 3: Replace the data-fetching logic**

Find the function that queries rides to compute daily stats. Replace it with:
```typescript
const loadStats = async (date: string) => {
  const { totalEarnings, totalBookingFee, ridesCount } =
    await getRiderDailyStats(profile.id, date);
  setStats({ totalEarnings, totalBookingFee, rideCount: ridesCount });
};
```

Find the function that queries remittances. Replace it with:
```typescript
const loadRemittances = async () => {
  const data = await getRiderRemittances(profile.id);
  setRemittances(data);
  setTodayRemit(data.find(r => r.remittance_date === today()) ?? null);
};
```

- [ ] **Step 4: Replace the upload + create remittance logic**

Find the image-pick + upload + insert logic. Replace the Supabase storage call and insert with:
```typescript
const url = await uploadReceipt(profile.id, imageUri);
if (!url) { Alert.alert('Upload failed'); return; }

const remittance = await createRemittance(
  profile.id,
  `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
  profile.avatar_url ?? null,
  today(),
  stats?.totalEarnings ?? 0,
  stats?.totalBookingFee ?? 0,
  stats?.totalBookingFee ?? 0,
  url,
  0,
);
if (!remittance) { Alert.alert('Failed to submit remittance'); return; }
await loadRemittances();
```

- [ ] **Step 5: Verify**

Run `npm start`, open Remit tab — stats and history should load, image upload should work.

---

### Task 2.3: Wire TeamScreen to teamService

**Files:**
- Modify: `src/screens/rider/TeamScreen.tsx`

- [ ] **Step 1: Add service imports**

At the top of `TeamScreen.tsx`, add:
```typescript
import { fetchMyTeam, fetchRiderMembership, Team, TeamMember } from '../../lib/teamService';
```

Remove the local `Team` and `TeamMember` interfaces.

- [ ] **Step 2: Replace the leader's data-fetch with fetchMyTeam**

Find the `fetchData` function. Replace the leader branch:

```typescript
const fetchData = async () => {
  if (isLeader) {
    const teamData = await fetchMyTeam(profile.id);
    if (teamData) {
      setTeam(teamData);
      setMembers((teamData.members ?? []).map(m => m.rider).filter(Boolean) as any[]);
    }
  } else {
    const membership = await fetchRiderMembership(profile.id);
    setMyTeam(membership);
  }
};
```

- [ ] **Step 3: Remove the supabase import if no longer used**

Check the rest of the file. If `supabase` is no longer referenced, remove:
```typescript
import { supabase } from '../../lib/supabase';
```

- [ ] **Step 4: Verify**

Run `npm start`, open Team tab as a team leader — members should display. As a regular rider, the team info should display.

---

### Task 2.4: Commit Phase 2

- [ ] **Step 1: Stage and commit**

```bash
git add src/screens/rider/NewsScreen.tsx src/screens/rider/RemitScreen.tsx src/screens/rider/TeamScreen.tsx
git commit -m "feat: wire rider screens to service layer"
```

**✅ PHASE 2 COMPLETE — safe to pause here**

---

## ━━━ PHASE 3: Voucher UI in User Booking Flow ━━━

> **Pause point:** After commit at end of Phase 3. Requires Phase 1 to be done first.

---

### Task 3.1: Add voucher state to HomeScreen

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add import**

At the top of `HomeScreen.tsx`, add:
```typescript
import {
  fetchUserVouchers,
  addVoucherToUser,
  markVoucherUsed,
  quoteVoucher,
  UserVoucher,
  VoucherQuote,
} from '../../lib/voucherService';
```

- [ ] **Step 2: Add state variables**

Inside the `HomeScreen` component, after existing state declarations, add:
```typescript
const [userVouchers, setUserVouchers] = useState<UserVoucher[]>([]);
const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);
const [voucherQuote, setVoucherQuote] = useState<VoucherQuote | null>(null);
const [voucherCode, setVoucherCode] = useState('');
const [voucherLoading, setVoucherLoading] = useState(false);
const [showVoucherList, setShowVoucherList] = useState(false);
```

- [ ] **Step 3: Fetch vouchers when entering select step**

Find the point where `step` transitions to `'select'` (the "Find a Rider" button handler). After setting step, add:
```typescript
fetchUserVouchers(profile.id).then(setUserVouchers);
```

---

### Task 3.2: Add voucher section to the Select panel UI

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add redeem handler**

Inside `HomeScreen`, add:
```typescript
const handleRedeemVoucher = async () => {
  if (!voucherCode.trim()) return;
  setVoucherLoading(true);
  const { userVoucher, error } = await addVoucherToUser(profile.id, voucherCode);
  if (error) {
    Alert.alert('Voucher Error', error);
  } else if (userVoucher) {
    setUserVouchers(prev => [userVoucher, ...prev.filter(v => v.id !== userVoucher.id)]);
    setVoucherCode('');
    Alert.alert('Added!', 'Voucher added to your list.');
  }
  setVoucherLoading(false);
};

const handleSelectVoucher = (uv: UserVoucher | null) => {
  setSelectedVoucher(uv);
  setShowVoucherList(false);
  if (!uv || !fareBreakdown) { setVoucherQuote(null); return; }
  if (uv.voucher) setVoucherQuote(quoteVoucher(uv.voucher, fareBreakdown));
};
```

(Note: `fareBreakdown` is the existing state variable for the calculated fare.)

- [ ] **Step 2: Add the voucher section JSX inside the Select step panel**

Find the Select step render (where ride tier cards are shown). Below the ride tier cards and above the "Book Ride" button, add:

```tsx
{/* Voucher Section */}
<View style={styles.voucherSection}>
  <TouchableOpacity
    style={styles.voucherHeader}
    onPress={() => setShowVoucherList(v => !v)}
  >
    <Text style={styles.voucherHeaderText}>
      🎟 {selectedVoucher ? `Applied: ${selectedVoucher.code}` : 'Apply Voucher'}
    </Text>
    <Text style={styles.voucherChevron}>{showVoucherList ? '▲' : '▼'}</Text>
  </TouchableOpacity>

  {showVoucherList && (
    <View style={styles.voucherDropdown}>
      {/* Redeem input */}
      <View style={styles.redeemRow}>
        <TextInput
          style={styles.redeemInput}
          placeholder="Enter code"
          placeholderTextColor="#9ca3af"
          value={voucherCode}
          onChangeText={setVoucherCode}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[styles.redeemBtn, voucherLoading && { opacity: 0.5 }]}
          onPress={handleRedeemVoucher}
          disabled={voucherLoading}
        >
          <Text style={styles.redeemBtnText}>Redeem</Text>
        </TouchableOpacity>
      </View>

      {/* No voucher option */}
      <TouchableOpacity
        style={[styles.voucherItem, !selectedVoucher && styles.voucherItemSelected]}
        onPress={() => handleSelectVoucher(null)}
      >
        <Text style={styles.voucherItemCode}>No voucher</Text>
      </TouchableOpacity>

      {/* Available vouchers */}
      {userVouchers.map(uv => (
        <TouchableOpacity
          key={uv.id}
          style={[styles.voucherItem, selectedVoucher?.id === uv.id && styles.voucherItemSelected]}
          onPress={() => handleSelectVoucher(uv)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.voucherItemCode}>{uv.code}</Text>
            <Text style={styles.voucherItemDesc}>
              {uv.voucher?.discount_type === 'percentage'
                ? `${uv.voucher.discount_value}% off`
                : `₱${uv.voucher?.discount_value} off`}
            </Text>
          </View>
          {selectedVoucher?.id === uv.id && (
            <Text style={styles.voucherCheck}>✓</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  )}

  {/* Discount line in fare summary */}
  {voucherQuote && voucherQuote.discount > 0 && (
    <View style={styles.discountRow}>
      <Text style={styles.discountLabel}>Voucher Discount</Text>
      <Text style={styles.discountValue}>−₱{voucherQuote.discount}</Text>
    </View>
  )}
</View>
```

- [ ] **Step 3: Add the styles**

In `StyleSheet.create({...})` at the bottom of `HomeScreen.tsx`, add:
```typescript
voucherSection: { marginTop: 10, marginBottom: 4 },
voucherHeader: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  paddingVertical: 12, paddingHorizontal: 4,
  borderTopWidth: 1, borderTopColor: '#f3f4f6',
},
voucherHeaderText: { fontSize: 14, fontWeight: '600', color: '#030712' },
voucherChevron: { fontSize: 12, color: '#9ca3af' },
voucherDropdown: {
  backgroundColor: '#f9fafb', borderRadius: 12,
  borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden', marginBottom: 8,
},
redeemRow: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
redeemInput: {
  flex: 1, backgroundColor: '#fff', borderRadius: 8,
  paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
  borderWidth: 1, borderColor: '#e5e7eb', color: '#030712',
},
redeemBtn: {
  backgroundColor: '#030712', borderRadius: 8,
  paddingHorizontal: 14, justifyContent: 'center',
},
redeemBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
voucherItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center' },
voucherItemSelected: { backgroundColor: '#ecfdf5' },
voucherItemCode: { fontSize: 13, fontWeight: '700', color: '#030712' },
voucherItemDesc: { fontSize: 11, color: '#6b7280', marginTop: 2 },
voucherCheck: { fontSize: 16, color: '#10b981', marginLeft: 8 },
discountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 4 },
discountLabel: { fontSize: 13, color: '#10b981' },
discountValue: { fontSize: 13, fontWeight: '700', color: '#10b981' },
```

---

### Task 3.3: Pass voucher to booking and mark used on completion

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Include voucher fields in the ride insert**

Find the place where a ride is created in Supabase (the booking action, searching for `.insert({` near `status: 'pending'`). Add these fields to the insert payload:
```typescript
voucher_id: selectedVoucher?.voucher_id ?? null,
voucher_discount: voucherQuote?.discount ?? 0,
fare: voucherQuote?.finalFare ?? fareBreakdown?.totalFare ?? 0,
```

- [ ] **Step 2: Mark voucher used when ride completes**

Find the place where ride completion is handled (the `RIDE_COMPLETED` broadcast listener or when `step` is set to `'review'`). After the ride completes, add:
```typescript
if (selectedVoucher) {
  await markVoucherUsed(selectedVoucher.id, currentRideId);
}
```

- [ ] **Step 3: Clear voucher state on cancel/reset**

Find `handleCancelBooking` or wherever ride state is cleared. Add:
```typescript
setSelectedVoucher(null);
setVoucherQuote(null);
setVoucherCode('');
setShowVoucherList(false);
```

- [ ] **Step 4: Verify**

Run `npm start`. In the booking flow:
1. Reach the Select step
2. Tap "Apply Voucher" — list + redeem input should appear
3. Enter a valid voucher code and tap Redeem — voucher should appear in list
4. Select a voucher — discount line should appear in fare

---

### Task 3.4: Commit Phase 3

- [ ] **Step 1: Stage and commit**

```bash
git add src/screens/user/HomeScreen.tsx
git commit -m "feat: add voucher selector to user booking flow"
```

**✅ PHASE 3 COMPLETE — safe to pause here**

---

## ━━━ PHASE 4: App Settings Gate ━━━

> **Pause point:** After commit at end of Phase 4. Requires Phase 1 to be done first.

---

### Task 4.1: Load app settings in App.tsx

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Add import and state**

At the top of `App.tsx`, add:
```typescript
import { getAppSettings, AppSettings } from './src/lib/settingsService';
```

Inside the `App` component, add state:
```typescript
const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
```

- [ ] **Step 2: Fetch settings on mount**

Inside the existing `useEffect` (or a new one), add:
```typescript
useEffect(() => {
  getAppSettings().then(s => { if (s) setAppSettings(s); });
}, []);
```

- [ ] **Step 3: Pass settings to navigators**

Find where `RiderNavigator` and `UserNavigator` are rendered. Pass settings as a prop:
```tsx
// Add the prop to RiderNavigator
{isRider
  ? <RiderNavigator appSettings={appSettings} />
  : <UserNavigator />
}
```

---

### Task 4.2: Gate Remittance tab and show maintenance banner

**Files:**
- Modify: `src/navigation/RiderNavigator.tsx`

- [ ] **Step 1: Accept appSettings prop**

Change the component signature:
```typescript
import { AppSettings } from '../lib/settingsService';

interface Props { appSettings: AppSettings | null; }

export default function RiderNavigator({ appSettings }: Props) {
```

- [ ] **Step 2: Gate the Remittance tab**

Find the `<Tab.Screen name="Remit" ...>` block. Wrap it conditionally:
```tsx
{(appSettings?.remittance_enabled !== false) && (
  <Tab.Screen
    name="Remit"
    options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💵" label="Remit" focused={focused} /> }}
    component={RemitScreen}
  />
)}
```

- [ ] **Step 3: Add maintenance banner**

At the top of the `return` in `RiderNavigator`, before `<Tab.Navigator>`, add:
```tsx
{appSettings?.maintenance_mode === 'half' && (
  <View style={tabStyles.maintenanceBanner}>
    <Text style={tabStyles.maintenanceText}>
      ⚠ {appSettings.maintenance_message ?? 'Limited service. Some features unavailable.'}
    </Text>
  </View>
)}
```

Wrap the whole return in a `<View style={{ flex: 1 }}>`:
```tsx
return (
  <View style={{ flex: 1 }}>
    {appSettings?.maintenance_mode === 'half' && (
      <View style={tabStyles.maintenanceBanner}>
        <Text style={tabStyles.maintenanceText}>
          ⚠ {appSettings.maintenance_message ?? 'Limited service. Some features unavailable.'}
        </Text>
      </View>
    )}
    <Tab.Navigator ...>
      ...
    </Tab.Navigator>
  </View>
);
```

- [ ] **Step 4: Add styles**

In `tabStyles`, add:
```typescript
maintenanceBanner: {
  backgroundColor: '#fef3c7',
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderBottomWidth: 1,
  borderBottomColor: '#fde68a',
},
maintenanceText: { fontSize: 12, color: '#92400e', fontWeight: '500', textAlign: 'center' },
```

- [ ] **Step 5: Handle full maintenance mode in App.tsx**

In `App.tsx`, before the `if (!session || !profile)` check, add:
```typescript
if (appSettings?.maintenance_mode === 'full') {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef3c7', padding: 32 }}>
      <Text style={{ fontSize: 40, marginBottom: 24 }}>🔧</Text>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#030712', textAlign: 'center', marginBottom: 12 }}>
        Under Maintenance
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
        {appSettings.maintenance_message ?? 'We\'ll be back shortly.'}
      </Text>
    </View>
  );
}
```

- [ ] **Step 6: Verify**

Run `npm start`. The app should load normally (maintenance_mode is 'off' by default). In Supabase, temporarily set `maintenance_mode = 'half'` — the yellow banner should appear.

---

### Task 4.3: Commit Phase 4

- [ ] **Step 1: Stage and commit**

```bash
git add App.tsx src/navigation/RiderNavigator.tsx
git commit -m "feat: app settings gate — remittance tab, maintenance banner"
```

**✅ PHASE 4 COMPLETE — safe to pause here**

---

## ━━━ PHASE 5: Active Ride Persistence ━━━

> **Pause point:** After commit at end of Phase 5. Independent — can be done without Phase 3 or 4.

---

### Task 5.1: User ride persistence in HomeScreen

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add persistence key constant**

At the top of `HomeScreen.tsx` (outside the component), add:
```typescript
const USER_RIDE_KEY = 'biyahero_user_ride';
```

- [ ] **Step 2: Add save helper**

Inside `HomeScreen`, add:
```typescript
const saveRideState = async (overrides?: Partial<Record<string, any>>) => {
  if (!currentRideId) return;
  const state = {
    currentRideId,
    step,
    pickup: pickupLabel,
    pickupCoords,
    dropoff: destination,
    destinationCoords,
    selectedRide,
    fareBreakdown,
    selectedVoucher,
    voucherDiscount: voucherQuote?.discount ?? 0,
    activeRider,
    ...overrides,
  };
  await AsyncStorage.setItem(USER_RIDE_KEY, JSON.stringify(state));
};

const clearRideState = async () => {
  await AsyncStorage.removeItem(USER_RIDE_KEY);
};
```

(Note: `AsyncStorage` is already imported at the top of `HomeScreen.tsx`.)

- [ ] **Step 3: Restore on mount**

Find the main `useEffect` that runs on mount (or add a new one). Add restore logic:
```typescript
useEffect(() => {
  (async () => {
    const raw = await AsyncStorage.getItem(USER_RIDE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved.currentRideId) return;

      // Verify the ride is still active in DB
      const { data } = await supabase
        .from('rides')
        .select('status')
        .eq('id', saved.currentRideId)
        .single();

      if (!data || data.status === 'completed' || data.status === 'cancelled') {
        await clearRideState();
        return;
      }

      // Restore state
      setCurrentRideId(saved.currentRideId);
      setStep(saved.step);
      setPickupLabel(saved.pickup ?? 'Current Location');
      if (saved.pickupCoords) setPickupCoords(saved.pickupCoords);
      setDestination(saved.dropoff ?? '');
      if (saved.destinationCoords) setDestinationCoords(saved.destinationCoords);
      if (saved.selectedRide) setSelectedRide(saved.selectedRide);
      if (saved.fareBreakdown) setFareBreakdown(saved.fareBreakdown);
      if (saved.activeRider) setActiveRider(saved.activeRider);
      // Toast — use Alert as a simple substitute
      Alert.alert('Ride Resumed', 'Your active booking has been restored.');
    } catch {
      await clearRideState();
    }
  })();
}, []);
```

- [ ] **Step 4: Save on state changes**

Find where `step`, `activeRider`, or `currentRideId` are set. After each change call `saveRideState()`. Key places:
- After `setStep('searching')` in the booking handler → `saveRideState({ step: 'searching' })`
- After `setActiveRider(rider)` → `saveRideState({ activeRider: rider, step: 'matched' })`
- On cancel (`handleCancelBooking`) → `clearRideState()`
- On review complete → `clearRideState()`

- [ ] **Step 5: Verify**

Run `npm start`, start a booking until Searching step, kill the app, reopen — should resume at Searching.

---

### Task 5.2: Rider ride persistence in RiderHomeScreen

**Files:**
- Modify: `src/screens/rider/RiderHomeScreen.tsx`

- [ ] **Step 1: Add key constant and helpers**

At the top of `RiderHomeScreen.tsx` (outside component), add:
```typescript
const RIDER_RIDE_KEY = 'biyahero_rider_ride';
```

Inside the component, add:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const saveRiderRide = async (request: any, accepted: boolean) => {
  await AsyncStorage.setItem(RIDER_RIDE_KEY, JSON.stringify({ currentRequest: request, requestAccepted: accepted }));
};

const clearRiderRide = async () => {
  await AsyncStorage.removeItem(RIDER_RIDE_KEY);
};
```

- [ ] **Step 2: Restore on mount**

Add a `useEffect` that runs once on mount:
```typescript
useEffect(() => {
  (async () => {
    const raw = await AsyncStorage.getItem(RIDER_RIDE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved.currentRequest?.rideId) { await clearRiderRide(); return; }

      const { data } = await supabase
        .from('rides')
        .select('status')
        .eq('id', saved.currentRequest.rideId)
        .single();

      if (!data || data.status === 'completed' || data.status === 'cancelled' || data.status === 'pending') {
        await clearRiderRide();
        return;
      }

      setCurrentRequest(saved.currentRequest);
      setRequestAccepted(saved.requestAccepted ?? false);
      setActiveRide(saved.currentRequest);
      acceptedRideIdRef.current = saved.currentRequest.rideId;
    } catch {
      await clearRiderRide();
    }
  })();
}, []);
```

- [ ] **Step 3: Save and clear at the right points**

- After `handleAccept` succeeds → `saveRiderRide(currentRequest, true)`
- After `handleCompleteRide` → `clearRiderRide()`
- After rider cancel → `clearRiderRide()`
- On sign out → `clearRiderRide()`

- [ ] **Step 4: Verify**

Accept a ride, kill the app, reopen — the active ride should restore.

---

### Task 5.3: Commit Phase 5

- [ ] **Step 1: Stage and commit**

```bash
git add src/screens/user/HomeScreen.tsx src/screens/rider/RiderHomeScreen.tsx
git commit -m "feat: active ride persistence with AsyncStorage"
```

**✅ PHASE 5 COMPLETE — safe to pause here**

---

## ━━━ PHASE 6: Push Notifications (FCM) ━━━

> **Pause point:** After commit at end of Phase 6. Independent of Phases 2–5.

---

### Task 6.1: Register FCM token when rider goes online

**Files:**
- Modify: `src/screens/rider/RiderHomeScreen.tsx`

- [ ] **Step 1: Add import**

```typescript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
```

(`expo-notifications` is already in `package.json`.)

- [ ] **Step 2: Add token registration helper**

Inside `RiderHomeScreen`, add:
```typescript
const registerPushToken = async () => {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } = existing === 'granted'
      ? { status: existing }
      : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync()).data;

    await supabase.from('fcm_tokens').upsert(
      { rider_id: profile.id, token, platform: Platform.OS },
      { onConflict: 'rider_id' },
    );
  } catch (e) {
    console.warn('registerPushToken:', e);
  }
};

const unregisterPushToken = async () => {
  try {
    await supabase.from('fcm_tokens').delete().eq('rider_id', profile.id);
  } catch { /* silent */ }
};
```

- [ ] **Step 3: Call on go-online / go-offline**

Find `toggleOnline`. After the existing `is_online: true` update, add:
```typescript
const toggleOnline = async (value: boolean) => {
  isOnlineRef.current = value;
  setIsOnline(value);
  if (!value) {
    setHasRequest(false);
    setRequestQueue([]);
    await unregisterPushToken();
  } else {
    await registerPushToken();
  }
  await supabase.from('profiles').update({ is_online: value }).eq('id', profile.id);
};
```

- [ ] **Step 4: Unregister on sign out**

Find the sign-out handler (passed via `onSignOut`). Before calling it, add `unregisterPushToken()`.

- [ ] **Step 5: Verify**

Run `npm start` on a physical device (push tokens don't work on simulators). Toggle online — check the `fcm_tokens` table in Supabase to confirm the token row appears. Toggle offline — row should be deleted.

---

### Task 6.2: Commit Phase 6

- [ ] **Step 1: Stage and commit**

```bash
git add src/screens/rider/RiderHomeScreen.tsx
git commit -m "feat: register FCM push token on rider go-online"
```

**✅ PHASE 6 COMPLETE — all phases done**

---

## Phase Dependency Map

```
Phase 1 (Services) ──► Phase 2 (Wire screens)
                   ──► Phase 3 (Voucher UI)
                   ──► Phase 4 (Settings gate)

Phase 5 (Persistence)  — independent, any time after Phase 1
Phase 6 (Push notifs)  — independent, any time
```

You can safely do: 1 → 2 → pause, then resume at 3. Or 1 → 3 → pause, then 2. Phases 5 and 6 can be done at any time after Phase 1.
