# Mobile Integration — Phased Implementation Design
_Date: 2026-05-12_

## Context

Porting service layer and missing features from the web app (`ridebooking-concept`) into the React Native app (`ridebooking-mobile`), using the `MOBILE_INTEGRATION.md` doc as the source of truth.

**Key constraint:** Mobile app uses only the regular Supabase anon-key client. No `supabaseAdmin` / service-role key. Admin-only functions are excluded. RLS policies on the DB handle authorization.

---

## Current State

### Already in mobile
- `src/lib/fareService.ts` — fare calculation, pricing config ✓
- `src/lib/chatService.ts` — send, fetch, subscribe ✓
- `src/lib/supabase.ts` — auth, profile types ✓
- `src/screens/user/HomeScreen.tsx` — full user flow (home → select → searching → matched → review) in one file ✓
- `src/screens/rider/RiderHomeScreen.tsx` — online toggle, GPS, accept/decline, chat ✓
- Rider tabs: HistoryScreen, NewsScreen, RemitScreen, TeamScreen — exist but use inline Supabase queries

### Missing from mobile
| Service | Web source | Mobile status |
|---------|-----------|---------------|
| `voucherService.ts` | `ridebooking-concept/src/lib/voucherService.ts` | Missing |
| `settingsService.ts` | `ridebooking-concept/src/lib/settingsService.ts` | Missing |
| `newsService.ts` | `ridebooking-concept/src/lib/newsService.ts` | Missing |
| `remittanceService.ts` | `ridebooking-concept/src/lib/remittanceService.ts` | Missing |
| `teamService.ts` | `ridebooking-concept/src/lib/teamService.ts` | Missing |
| Voucher UI | HomeScreen Select step | Missing |
| App settings gate | Startup + RiderNavigator | Missing |
| Active ride persistence | AsyncStorage | Missing |
| FCM push notifications | Go-online action | Missing |

---

## Phases

Each phase leaves the app fully working. Pause or resume at any phase boundary.

---

### Phase 1 — Service Layer
**Files created:** 5 new files in `src/lib/`

**`voucherService.ts`** (mobile-safe subset)
- Types: `Voucher`, `UserVoucher`, `VoucherQuote`
- `normalizeVoucherCode(code)` — trim + uppercase
- `isVoucherInWindow(voucher)` — date window check
- `calculateVoucherDiscount(voucher, fare)` — percentage or fixed
- `getVoucherRideIssue(voucher, fare, distanceKm)` — validation string
- `quoteVoucher(voucher, breakdown)` — combined quote
- `fetchUserVouchers(userId)` — reads `user_vouchers` joined with `vouchers`
- `addVoucherToUser(userId, code)` — inserts into `user_vouchers`
- `markVoucherUsed(userVoucherId, rideId)` — updates status to 'used'

**`settingsService.ts`** (read-only)
- Type: `AppSettings`
- `getAppSettings()` — reads `app_settings` row id=1

**`newsService.ts`** (read-only)
- Type: `NewsPost`
- `fetchNewsPosts()` — published + non-archived posts, ordered desc

**`remittanceService.ts`** (rider scope)
- Type: `Remittance`
- `getRiderRemittances(riderId, dateFilter?)` — rider's own remittances
- `getRiderDailyStats(riderId, date)` — completed rides for a date → earnings + booking fee totals
- `uploadReceipt(riderId, uri)` — uploads image from expo-image-picker result to Supabase Storage, returns public URL
- `createRemittance(...)` — inserts remittance row
- `getTeamRemittances(riderIds[], dateFilter?)` — team leader view

**`teamService.ts`** (rider/leader scope)
- Types: `Team`, `TeamMember`
- `fetchMyTeam(leaderId)` — leader's team with members
- `fetchTeamWithMembers(teamId)` — team + members
- `fetchRiderMembership(riderId)` — which team this rider belongs to
- `addTeamMember(teamId, riderId)` — insert team_member
- `removeTeamMember(teamId, riderId)` — delete team_member

**Adaptation from web:** Replace all `supabaseAdmin` calls with `supabase`. Remove admin-write functions (createVoucher, updateVoucher, createTeam, etc.). For `uploadReceipt`, accept a local `uri` string (from expo-image-picker) instead of a `File` object.

---

### Phase 2 — Wire Rider Screens to Services
**Files modified:** 3 screen files

- `RemitScreen.tsx` — replace inline queries with `getRiderDailyStats()`, `getRiderRemittances()`, `createRemittance()`, `uploadReceipt()` from `remittanceService`
- `NewsScreen.tsx` — replace inline query with `fetchNewsPosts()` from `newsService`
- `TeamScreen.tsx` — replace inline queries with `fetchMyTeam()`, `fetchTeamWithMembers()`, `addTeamMember()`, `removeTeamMember()` from `teamService`

No behaviour changes — pure refactor to use service layer.

---

### Phase 3 — Voucher UI in User Booking Flow
**Files modified:** `HomeScreen.tsx`

Add to the **Select step** (ride tier selection panel):
- "My Vouchers" collapsible section below the ride tier cards
- Lists `fetchUserVouchers(userId)` results — code, discount description, expiry
- "Add Voucher Code" text input + "Redeem" button → `addVoucherToUser()`
- Selecting a voucher → `quoteVoucher()` recalculates fare, shows discount line in fare breakdown
- Selected voucher passed into the ride booking payload (`voucher_id`, `voucher_discount`)
- On ride completion → `markVoucherUsed(userVoucherId, rideId)`

---

### Phase 4 — App Settings Gate
**Files modified:** `App.tsx`, `RiderNavigator.tsx`

- On app startup (in `App.tsx`), call `getAppSettings()` once and store in a React context or pass as prop
- Gate the **Remittance tab** in `RiderNavigator.tsx`: hide tab when `settings.remittance_enabled === false`
- Show a yellow **maintenance banner** in the app shell when `settings.maintenance_mode === 'half'`
- Full maintenance mode (`'full'`): replace entire app UI with a maintenance screen

---

### Phase 5 — Active Ride Persistence
**Files modified:** `HomeScreen.tsx`, `RiderHomeScreen.tsx`

Key: `AsyncStorage` (already installed). Replace localStorage references from the doc.

**User ride** — key `biyahero_user_ride`
- Save on every state change: `{ currentRideId, step, pickup, pickupCoords, dropoff, destinationCoords, selectedRide, fareBreakdown, selectedVoucher, voucherDiscount, activeRider }`
- On mount: restore → fetch ride from DB → if `completed` or `cancelled`, clear. Otherwise resume at saved step with toast "Resumed your active booking"
- Clear on ride completion, cancellation, or sign-out

**Rider ride** — key `biyahero_rider_ride`
- Save: `{ currentRequest, requestAccepted }`
- On mount: restore → fetch ride from DB → if stale, clear. Otherwise resume with banner "Resumed your active ride"

---

### Phase 6 — Push Notifications
**Files modified:** `RiderHomeScreen.tsx`

- On **Go Online**: call `expo-notifications` to request permission + get push token → upsert token into a `fcm_tokens` table (`rider_id`, `token`, `platform`)
- On **Go Offline**: remove/clear the token row for this rider
- No changes to the notification sending side (that runs server-side or from admin)

---

## File Change Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `src/lib/voucherService.ts`, `settingsService.ts`, `newsService.ts`, `remittanceService.ts`, `teamService.ts` | — |
| 2 | — | `RemitScreen.tsx`, `NewsScreen.tsx`, `TeamScreen.tsx` |
| 3 | — | `HomeScreen.tsx` |
| 4 | — | `App.tsx`, `RiderNavigator.tsx` |
| 5 | — | `HomeScreen.tsx`, `RiderHomeScreen.tsx` |
| 6 | — | `RiderHomeScreen.tsx` |

---

## Non-Goals
- Admin dashboard features (voucher CRUD, remittance review, team management by admin)
- `supabaseAdmin` / service-role key in mobile
- Web platform support for new features (mobile-only)
