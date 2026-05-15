# Admin Integration Design — BiyaHero Mobile

**Date:** 2026-05-15
**Status:** Approved

---

## Overview

Integrate admin dashboard capabilities into the React Native mobile app (`ridebooking-mobile`). Admin and super_admin users currently fall through to the passenger view. This adds a dedicated `AdminNavigator` with role-gated routing and secure write operations via Supabase Edge Functions.

---

## Architecture

### Routing (App.tsx)

```
role === 'admin' | 'super_admin'  →  AdminNavigator
role === 'rider' | 'team_leader'  →  RiderNavigator
else                              →  UserNavigator
```

### Security Model

- **Reads**: anon key + Supabase RLS policies granting admin/super_admin read-all access
- **Writes**: Supabase Edge Functions — receive user JWT, verify admin role server-side, execute writes using service key
- **Never bundle service role key** in the mobile app binary

### Edge Functions (Phase 1)

| Function | Purpose |
|---|---|
| `admin-verify-rider` | Set `rider_status` → approved / rejected / pending |
| `admin-review-remittance` | Set remittance `status` + `admin_notes` |
| `admin-block-user` | Set `is_blocked`, `block_reason`, `blocked_by` / unblock |

---

## Navigation

`AdminNavigator` — bottom tab navigator (mirrors RiderNavigator pattern):

| Tab | Icon | Screen |
|---|---|---|
| Live | activity | `AdminLiveScreen` |
| Verify | file-text | `RiderVerificationScreen` |
| Remit | receipt | `AdminRemittancesScreen` |
| Blocking | ban | `UserBlockingScreen` |
| Profile | person | `AdminProfileScreen` |

---

## Phase 1 Screens

### AdminLiveScreen — Live Operations
- Stats row: Registered Passengers, Approved Riders, Online Now
- Rider list: avatar, name, status badge (Online/On Trip), GPS coords
- Ongoing rides list: passenger → rider, pickup → dropoff, status badge
- Data: `profiles` count queries + `rides` where status not in (completed, cancelled)
- Realtime: Supabase channel `admin-rider-locations` for RIDER_LOCATION broadcasts

### RiderVerificationScreen — Rider Verification
- Filter bar: All / Pending / Approved / Rejected
- Applicant cards: avatar, name, email, submission date, status badge, Review button
- Review bottom sheet: personal info, vehicle info, document images (license, OR/CR, vehicle photo), Approve / Reject / Reset to Pending buttons
- Calls Edge Function `admin-verify-rider`

### AdminRemittancesScreen — Remittances
- Filter bar: status (all/pending/approved/rejected) + date picker
- Submission list (paginated 10/page): rider name, date, amount due, amount remitted, status badge, receipt thumbnail
- Review bottom sheet: rider info, receipt image (tap to fullscreen), admin notes textarea, Approve / Reject buttons
- Calls Edge Function `admin-review-remittance`

### UserBlockingScreen — User Blocking
- Search input + filter: role (all/user/rider), status (all/blocked/active)
- User list: avatar, name, email, role badge, block status badge, block reason if blocked
- Block flow: tap Block → modal with reason input → confirm → calls Edge Function `admin-block-user`
- Unblock flow: tap Unblock → confirm → calls Edge Function `admin-block-user` (unblock action)

### AdminProfileScreen — Admin Profile
- Name, email, role badge
- Sign out button

---

## Mobile Responsiveness

All screens:
- `FlatList` for all lists (no sidebar, full mobile width)
- Bottom sheets via `Modal` with slide-up animation
- Stat cards: horizontal `ScrollView` row on small screens
- Images: `Image` with `resizeMode="contain"`, lightbox via `Modal`
- Inputs: `KeyboardAvoidingView` wrapping all form modals

---

## Profile Type Updates

Add missing fields to `Profile` interface in `src/lib/supabase.ts`:
```typescript
is_blocked: boolean
block_reason: string | null
blocked_by: string | null
blocked_at: string | null
reviewed_by: string | null
reviewed_by_name: string | null
reviewed_at: string | null
admin_role_ids: string[]
cover_photo_url: string | null
drivers_license_url: string | null
```

---

## New Files

```
src/
  navigation/
    AdminNavigator.tsx          ← new
  screens/admin/
    AdminLiveScreen.tsx         ← new
    RiderVerificationScreen.tsx ← new
    AdminRemittancesScreen.tsx  ← new
    UserBlockingScreen.tsx      ← new
    AdminProfileScreen.tsx      ← new
  lib/
    adminService.ts             ← new (Edge Function callers)
supabase/functions/
  admin-verify-rider/index.ts   ← new
  admin-review-remittance/index.ts ← new
  admin-block-user/index.ts     ← new
```

**Modified files:**
- `App.tsx` — add admin routing
- `src/lib/supabase.ts` — extend Profile type

---

## Phasing

| Phase | Modules | Status |
|---|---|---|
| **Phase 1** | Live Operations, Rider Verification, Remittances, User Blocking | **This sprint** |
| **Phase 2** | Driver Management, Team Management, News Feed | Next |
| **Phase 3** | Booking Analytics, Revenue Dashboard, Ride Reviews | Future |
| **Phase 4** | Pricing Config, Vouchers, App Settings, Maintenance Mode | Future |
| **Phase 5** | Roles & Permissions, User Management | Future |

---

## Out of Scope (Phase 1)

- Impersonation
- Charts/analytics
- Pricing config
- Voucher management
- Role & permission management
- Map view for live ops (list view only in Phase 1)
