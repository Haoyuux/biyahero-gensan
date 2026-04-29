# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on port 3000 (0.0.0.0)
npm run build        # Production build (Vite)
npm run preview      # Preview production build
npm run lint         # Type-check via tsc --noEmit
npm run clean        # Remove dist/
```

## Environment

Copy `.env.example` to `.env` and set:
- `GEMINI_API_KEY` — required for Google Generative AI features
- `APP_URL` — hosting URL (auto-injected by AI Studio)
- `VITE_SUPABASE_URL` — Supabase project URL (client-side)
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key (client-side)
- `VITE_SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key; required for `supabaseAdmin` operations (storage uploads, remittance writes, settings writes). Falls back to anon key if unset, which will fail RLS-protected operations.

## Architecture

Monolithic React app (`src/App.tsx`, ~5,300 lines) with no routing library. All state lives in `App.tsx` via `useState`/`useEffect`. Service logic is extracted into `src/lib/`.

### Auth & Role-Based Routing

On load: session check → profile fetch → onboarding → profile setup. After auth, the root renders one of three top-level dashboards based on `profile.role`:

```
user         → UserApp        (ride booking flow)
rider        → RiderDashboard (driver view + earnings)
team_leader  → RiderDashboard (same view, plus team/remittance tabs)
admin        → AdminDashboard (operations + management)
super_admin  → AdminDashboard (full access + impersonation)
```

`super_admin` can impersonate other users to test their experience. Clicking the user avatar (top-right) from `UserApp` opens `AdminDashboard` regardless of role.

### User App — Step State Machine

```
home → select → searching → matched
```

- **home**: Pickup/dropoff input with Nominatim autocomplete + saved favorites
- **select**: Ride tier selection with dynamic pricing from `fareService`
- **searching**: 3.5s simulated driver search animation
- **matched**: Driver profile, real-time fare breakdown, in-app chat, cancel/rating

### Admin Dashboard

Tabs: Live Operations, Driver Management, Booking Analytics, Revenue Dashboard, Reviews, Users, Riders (filterable by approval status), Pricing (editable config), Admin Roles (CRUD + module permissions), Teams, Remittances, News/Announcements, App Settings.

### Map Layer

Always-visible Leaflet map (CartoDB tiles) with:
- Blue `DivIcon` for current device location
- Green `DivIcon` for destination
- Route polyline from OSRM

Custom `DivIcon`s are used instead of default markers to avoid broken image paths in Vite. `dragstart`/`zoomstart` events disable auto-centering so the user can pan freely.

### External APIs

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Nominatim | `nominatim.openstreetmap.org/search` | Location autocomplete (500ms debounce, min 3 chars) |
| OSRM | `router.project-osrm.org/route/v1/driving` | Route geometry + distance/duration |

**Coordinate convention**: Nominatim returns `[lon, lat]`; Leaflet and all internal state use `[lat, lon]` — convert when calling OSRM.

### Pricing

Pricing config lives in `src/lib/fareService.ts` and is persisted to localStorage under `fetch_pricing_config`. Defaults:

| Tier | Base | Per-km | Per-min | Booking Fee |
|------|------|--------|---------|-------------|
| Motorcycle (`moto`) | ₱40 | ₱12 | ₱2 | ₱5 |
| Economy (`eco`) | ₱60 | ₱18 | ₱3 | ₱8 |
| Premium (`premium`) | ₱100 | ₱30 | ₱5 | ₱12 |

`calculateFare()` returns a `FareBreakdown` (baseFare, distanceFee, timeFee, bookingFee, totalFare). Admins can edit rates in the Pricing tab; changes are saved to localStorage.

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `fetch_user_ride` | Active ride state recovery (user) |
| `fetch_rider_ride` | Active ride state recovery (rider) |
| `fetch_favorites` | Saved pickup/dropoff places |
| `fetch_pricing_config` | Custom fare config overrides |

### Fallback

When geolocation is unavailable, the app defaults to Makati, Manila `[14.5547, 121.0244]`.

### Supabase Integration

**`src/lib/supabase.ts`** — auth, profiles, rider management, admin roles, storage:
- **Auth**: Google OAuth via `signInWithGoogle()` / `signOut()`. PKCE flow (`flowType: 'pkce'`).
- **Profiles**: `getProfile()`, `updateProfile()` — reads/writes the `profiles` table
- **Rider management**: `getRiderProfiles()`, `setRiderStatus()` (calls `set_rider_status` RPC)
- **Admin roles**: `getAdminRoles()`, `createAdminRole()`, `updateAdminRole()`, `deleteAdminRole()`, `assignAdminRoles()`
- **Storage**: `uploadImage(bucket, userId, file)` — buckets: `avatars`, `covers`, `documents`
- **Two clients**: `supabase` (anon key, respects RLS) and `supabaseAdmin` (service role key, bypasses RLS). All write operations in `newsService`, `remittanceService`, `settingsService`, and `teamService` use `supabaseAdmin`.

User roles: `super_admin | admin | team_leader | rider | user`. Rider approval states: `unsubmitted | pending | approved | rejected`.

**`src/lib/newsService.ts`** — admin news/announcements feed:
- Table: `news_posts` (title, content, category, image_url, author_id, author_name, published, is_archived)
- Categories: `Announcement | Update | Promo | Event | Important`
- `fetchNewsPosts(includeAll?)` — public fetches only `published=true, is_archived=false`; pass `true` for admin view
- `uploadNewsImage(file)` — uploads to `documents` bucket under `news/` path via `supabaseAdmin`

**`src/lib/remittanceService.ts`** — rider daily booking-fee remittance:
- Table: `remittances` (rider_id, remittance_date, total_earnings, total_booking_fee, amount_remitted, receipt_url, status)
- Status flow: `pending → approved | rejected` (admin reviews via `reviewRemittance()`)
- `getRiderDailyStats(riderId, date)` — queries `rides` table to compute daily earnings/booking fee totals
- `uploadReceipt(riderId, file)` — uploads to `documents` bucket under `remittances/{riderId}/`
- `getTeamRemittances(riderIds[])` — used by team leaders to view their members' remittances

**`src/lib/settingsService.ts`** — global app settings (singleton row id=1):
- Table: `app_settings` (app_name, document_title, app_logo_url, remittance_qr_url)
- `uploadSettingImage(file, folder)` — folder is `'logos'` or `'qrs'`; uploads to `documents` bucket

**`src/lib/teamService.ts`** — rider team management:
- Tables: `teams` (name, capacity, schedule_days, leader_id), `team_members` (team_id, rider_id)
- `schedule_days` is `number[]` where 0=Sun, 1=Mon … 6=Sat
- `fetchRiderMembership(riderId)` — gets the team a rider belongs to as member (not as leader)
- Team leaders identified by `profile.role === 'team_leader'`; `fetchMyTeam(leaderId)` retrieves their team

**`src/lib/chatService.ts`** — real-time in-app messaging via Supabase Realtime (`postgres_changes`):
- Tables: `messages` (ride_id, sender_id, sender_role, content, created_at), `conversation_deletions` (soft-delete per user)
- Key functions: `sendMessage()`, `fetchMessages(rideId)`, `subscribeToMessages(rideId, cb)` → returns unsubscribe fn, `fetchUserConversations()`, `fetchRiderConversations()`, `deleteConversation()`

**`src/lib/notificationService.ts`** — browser Notification API wrapper:
- `requestNotificationPermission()` — one-time permission prompt
- `pushNotification(title, body)` — native OS notification

### Connection Status

`useConnectionStatus()` hook detects online/offline state. `ConnectionBanner` displays a reconnection notice when the network drops.

## Tech Stack

- React 19 + TypeScript, Vite 6
- Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- Leaflet / React Leaflet for mapping
- Motion (Framer Motion fork) for animations
- `@google/genai` for AI integration
- `@supabase/supabase-js` for auth, database, storage, and realtime
- `lucide-react` for icons
- Express + dotenv (server-side)
- Path alias `@/` → project root
