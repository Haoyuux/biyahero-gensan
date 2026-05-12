# BiyaHero — React Native Mobile Integration Reference

> Complete documentation of all features, UI flows, button actions, state machines, and real-time events for the **User** and **Rider** roles. Use this as the single source of truth when rebuilding in React Native.
>
> Source references use the format `src/path/file.ts:LINE` — open the file at that line to see the implementation.

---

## Table of Contents

1. [App Architecture Overview](#1-app-architecture-overview)
2. [Auth & Onboarding Flow](#2-auth--onboarding-flow)
3. [Role Routing](#3-role-routing)
4. [User App — Full Flow](#4-user-app--full-flow)
   - 4.1 [Home Screen](#41-home-screen)
   - 4.2 [Select Screen](#42-select-screen)
   - 4.3 [Searching Screen](#43-searching-screen)
   - 4.4 [Matched Screen](#44-matched-screen)
   - 4.5 [Review Screen](#45-review-screen)
5. [Rider Dashboard — Full Flow](#5-rider-dashboard--full-flow)
   - 5.1 [Dashboard Home Tab](#51-dashboard-home-tab)
   - 5.2 [Incoming Request Card](#52-incoming-request-card)
   - 5.3 [Active Ride Screen](#53-active-ride-screen)
   - 5.4 [History Tab](#54-history-tab)
   - 5.5 [Remittance Tab](#55-remittance-tab)
   - 5.6 [Team Tab (Team Leaders)](#56-team-tab-team-leaders-only)
   - 5.7 [News Tab](#57-news-tab)
6. [Shared: Real-time Chat](#6-shared-real-time-chat)
7. [Shared: Notifications](#7-shared-notifications)
8. [Vouchers & Discounts](#8-vouchers--discounts)
9. [Real-time Broadcast Events](#9-real-time-broadcast-events)
10. [Cancellation Flows](#10-cancellation-flows)
11. [State Persistence & Recovery](#11-state-persistence--recovery)
12. [Maintenance Mode](#12-maintenance-mode)
13. [Pricing Model](#13-pricing-model)
14. [External APIs](#14-external-apis)
15. [Data Models](#15-data-models)
16. [Source Code Index](#16-source-code-index)

---

## 1. App Architecture Overview

- **Framework**: React 19 + TypeScript (Vite) — to be rebuilt as React Native
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Auth**: Google OAuth (PKCE flow) — `src/lib/supabase.ts:72`
- **Maps**: Leaflet (web) → replace with `react-native-maps` + MapLibre or Mapbox in RN
- **Real-time**: Supabase `postgres_changes` + broadcast channels
- **Geocoding**: Nominatim OSM (no API key required)
- **Routing**: OSRM (no API key required)
- **Payments**: Cash-based; booking fee tracked separately
- **Entry point**: `src/App.tsx` (~5300 lines, monolithic — all state and routing lives here)

### Service Layer (`src/lib/`)

| File | Purpose |
|------|---------|
| `supabase.ts` | Auth, profiles, rider management, admin roles, storage |
| `fareService.ts` | Fare calculation, pricing config |
| `chatService.ts` | Real-time messaging |
| `remittanceService.ts` | Rider daily booking-fee remittance |
| `voucherService.ts` | Voucher CRUD, validation, redemption |
| `newsService.ts` | Admin news/announcements feed |
| `settingsService.ts` | Global app settings (singleton) |
| `teamService.ts` | Rider team management |
| `notificationService.ts` | Browser Notification API wrapper |
| `maintenanceService.ts` | Maintenance mode state |
| `fcmService.ts` | FCM push notification tokens |

---

## 2. Auth & Onboarding Flow

```
App Load
  │
  ├─► Splash Screen (logo + loading spinner)
  │
  ├─► Session Check — supabase.auth.getSession()  [src/lib/supabase.ts:6]
  │     │
  │     ├─ No session ──► Login Screen
  │     │                   └─► "Sign in with Google" button
  │     │                         └─► signInWithGoogle()  [src/lib/supabase.ts:72]
  │     │
  │     └─ Has session ──► getProfile(userId)  [src/lib/supabase.ts:83]
  │                           │
  │                           ├─ No profile ──► Onboarding Screen
  │                           │                  Fields: first_name, last_name, phone
  │                           │                  Button: "Continue" → updateProfile()  [src/lib/supabase.ts:93]
  │                           │
  │                           ├─ Profile incomplete ──► Profile Setup Screen
  │                           │                          Fields: photo, bio, vehicle info (riders)
  │                           │                          Button: "Save Profile" → updateProfile()
  │                           │                          Photo: uploadImage('avatars', userId, file)  [src/lib/supabase.ts:206]
  │                           │
  │                           └─ Profile complete ──► Route by role (see §3)
```

### Login Screen Buttons
| Button | Action | Source |
|--------|--------|--------|
| Sign in with Google | `signInWithGoogle()` → OAuth redirect | `src/lib/supabase.ts:72` |

### Onboarding Screen Buttons
| Button | Action | Source |
|--------|--------|--------|
| Continue | Validates fields → `updateProfile(userId, data)` → navigate to role dashboard | `src/lib/supabase.ts:93` |

### Profile Setup Screen Buttons
| Button | Action | Source |
|--------|--------|--------|
| Upload Photo | Image picker → `uploadImage('avatars', userId, file)` | `src/lib/supabase.ts:206` |
| Save Profile | `updateProfile(userId, data)` → navigate to role dashboard | `src/lib/supabase.ts:93` |
| Skip (optional) | Bypasses optional fields only | — |

---

## 3. Role Routing

After auth, the app renders one of these top-level screens based on `profile.role`:

| Role | Component | Source | Description |
|------|-----------|--------|-------------|
| `user` | `UserApp` | `src/App.tsx:2398` | Ride booking flow |
| `rider` | `RiderDashboard` | `src/App.tsx:5623` | Driver view + earnings |
| `team_leader` | `RiderDashboard` | `src/App.tsx:5623` | Same as rider + Team & Remittance tabs |
| `admin` | `AdminDashboard` | `src/App.tsx` | Operations + management |
| `super_admin` | `AdminDashboard` | `src/App.tsx` | Full access + impersonation |

> **Note for RN**: `super_admin` can impersonate any user. Tapping the avatar in UserApp opens AdminDashboard regardless of role.

---

## 4. User App — Full Flow

> Component: `UserApp` — `src/App.tsx:2398`

### Step State Machine

```
home ──► select ──► searching ──► matched ──► review
  ▲                                  │
  └──────────────────────────────────┘
         (cancel at any point via handleCancelBooking — src/App.tsx:2823)
```

### User App Global State

| State Variable | Type | Purpose |
|----------------|------|---------|
| `step` | `"home" \| "select" \| "searching" \| "matched" \| "review"` | Current screen |
| `pickup` | `string` | Pickup address text |
| `pickupCoords` | `[lat, lon]` | Pickup GPS coords |
| `dropoff` | `string` | Dropoff address text |
| `destinationCoords` | `[lat, lon]` | Dropoff GPS coords |
| `selectedRide` | `"moto" \| "eco" \| "premium"` | Chosen ride tier |
| `fareBreakdown` | `FareBreakdown` | Itemized fare — `src/lib/fareService.ts:25` |
| `currentRideId` | `string` | Active ride DB ID |
| `activeRider` | `RiderProfile` | Matched driver info |
| `routeCoords` | `LatLng[]` | Route polyline (user→dest) |
| `riderPickupRouteCoords` | `LatLng[]` | Rider→pickup polyline |
| `deviceLocation` | `[lat, lon]` | Current GPS fix |
| `userVouchers` | `Voucher[]` | Available vouchers — `src/lib/voucherService.ts:7` |
| `selectedUserVoucher` | `Voucher \| null` | Applied voucher |
| `voucherDiscount` | `number` | Discount in ₱ |

### User App Header Buttons
| Button | Action | Source |
|--------|--------|--------|
| Menu (hamburger) | Opens slide-out menu | `src/App.tsx:2398` |
| Chat (message icon) | Opens `ChatHistoryScreen` | `src/App.tsx:17727` |
| Notifications (bell) | Opens notifications drawer | `src/lib/notificationService.ts:6` |
| News | Opens news posts modal | `src/lib/newsService.ts:27` |
| Avatar | Opens AdminDashboard (debug/super_admin) | — |
| Sign Out | `signOut()` → login screen | `src/lib/supabase.ts:79` |

---

### 4.1 Home Screen

> Component: `HomePanel` — `src/App.tsx:17943`

**Purpose**: Pick pickup and dropoff location, then find a rider.

#### Layout
```
┌─────────────────────────────────┐
│  [Map — always visible]         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📍 Pickup                │  │
│  │    [Current Location]     │  │
│  ├───────────────────────────┤  │
│  │ 🔵 Dropoff               │  │
│  │    [Search destination]   │  │
│  ├───────────────────────────┤  │
│  │ [Recent]  [Home] [Work]   │  │
│  │ [Saved Places list...]    │  │
│  ├───────────────────────────┤  │
│  │       [Find a Rider]      │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

#### Input Fields

**Pickup Field**
- Default value: "Current Location" (uses GPS)
- On tap: expands autocomplete
- Autocomplete: Nominatim OSM search (min 3 chars, 500ms debounce, limited to Mindanao)
- Shows "Use Current Location" option at top of list
- On select: sets `pickup` text + `pickupCoords`

**Dropoff Field**
- Placeholder: "Where to?"
- On tap: expands autocomplete
- Same Nominatim autocomplete behavior
- On select: sets `dropoff` text + `destinationCoords`
- Triggers OSRM route fetch automatically

#### Quick Destination Chips
| Chip | Action |
|------|--------|
| Recent | Shows last 5 searched places |
| Home | Sets saved home address |
| Work | Sets saved work address |
| [Saved Place] | Sets that saved location |

#### Buttons
| Button | State | Action | Source |
|--------|-------|--------|--------|
| Find a Rider | Disabled (gray) | Destination not set | `src/App.tsx:17943` |
| Find a Rider | Enabled (green) | `setStep("select")` | `src/App.tsx:17943` |

#### Validations before "Find a Rider"
1. Profile must have `first_name`, `last_name`, `phone` → shows "Complete your profile" alert
2. Location permission must be granted → shows location warning banner
3. Destination must be within Mindanao bounding box (118.3°–127.5°E, 4.5°–10.2°N) → shows "outside service area" alert
4. No existing active ride → shows "You already have an active ride" alert

#### Map Markers
| Marker | Color | Represents |
|--------|-------|-----------|
| Blue dot | Blue | Current device location |
| Pin | Green | Selected destination |
| Polyline | Blue | Route preview |

---

### 4.2 Select Screen

> Component: `SelectPanel` — `src/App.tsx:18417`

**Purpose**: Choose ride tier and confirm fare before booking.

#### Layout
```
┌─────────────────────────────────┐
│  [Map — route visible]          │
│                                 │
│  ┌───────────────────────────┐  │
│  │  ← Back   Choose a ride   │  │
│  │  📍 Pickup → 🔵 Dropoff   │  │
│  │  Distance: 5.2 km  12 min │  │
│  ├───────────────────────────┤  │
│  │  [Moto]  ₱XX  ETA Xmin   │  │
│  │  [Eco]   ₱XX  ETA Xmin   │  │
│  │  [Prem]  ₱XX  ETA Xmin   │  │
│  ├───────────────────────────┤  │
│  │  🎟 Apply Voucher ▼       │  │
│  ├───────────────────────────┤  │
│  │       [Book Ride]         │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

#### Ride Tier Cards
Each card shows:
- Vehicle type icon (motorcycle / car / premium car)
- Tier name
- Calculated fare (₱) — via `calculateFare()` at `src/lib/fareService.ts:82`
- Estimated ETA (minutes)
- Capacity (number of passengers)

On tap → selects tier → highlights card

#### Fare Breakdown (expanded on tap)
| Item | Calculation | Source |
|------|-------------|--------|
| Base Fare | Fixed per tier | `src/lib/fareService.ts:36` |
| Distance Fee | `distance_km × per_km_rate` (with optional free-km threshold) | `src/lib/fareService.ts:82` |
| Time Fee | `duration_min × per_min_rate` | `src/lib/fareService.ts:82` |
| Booking Fee | Fixed or per-km (configured per tier) | `src/lib/fareService.ts:36` |
| Voucher Discount | `calculateVoucherDiscount(voucher, fare)` | `src/lib/voucherService.ts:57` |
| **Total** | Sum of above | `src/lib/fareService.ts:82` |

#### Voucher Selector
- Lists vouchers via `fetchUserVouchers(userId)` — `src/lib/voucherService.ts:147`
- Each voucher shows: code, discount, expiry, min distance
- On select: updates `selectedUserVoucher` + recalculates `voucherDiscount` via `calculateVoucherDiscount()` — `src/lib/voucherService.ts:57`
- Validation via `getVoucherRideIssue()` — `src/lib/voucherService.ts:69`

#### Buttons
| Button | State | Action | Source |
|--------|-------|--------|--------|
| ← Back | Always | `setStep("home")` | `src/App.tsx:18417` |
| [Ride Tier Card] | Selectable | `setSelectedRide(tier)` | `src/App.tsx:18417` |
| Book Ride | Disabled | No tier selected | — |
| Book Ride | Enabled | `onBook(...)` → creates ride in DB → `setStep("searching")` | `src/App.tsx:3828` |

#### Booking Action — `onBook` (`src/App.tsx:3828`)
1. Creates ride record in Supabase:
   ```json
   {
     "status": "pending",
     "user_id": "...",
     "pickup": "...",
     "pickup_lat": ...,
     "pickup_lng": ...,
     "dropoff": "...",
     "dropoff_lat": ...,
     "dropoff_lng": ...,
     "ride_type": "moto|eco|premium",
     "fare": ...,
     "voucher_id": "...",
     "voucher_discount": ...
   }
   ```
2. Broadcasts `REQUEST_RIDE` event to all online riders every 4 seconds — `src/App.tsx:2670`
3. Expands target pool of riders every 15 seconds
4. Transitions to `searching` step

---

### 4.3 Searching Screen

> Component: `SearchingPanel` — `src/App.tsx:19072`

**Purpose**: Waiting animation while system finds a rider.

#### Layout
```
┌─────────────────────────────────┐
│  [Map — route visible]          │
│                                 │
│  ┌───────────────────────────┐  │
│  │   🔍 Finding your driver  │  │
│  │   [Pulsing animation]     │  │
│  │   Connecting to nearby    │  │
│  │   drivers...              │  │
│  │   [● ● ●] animated dots   │  │
│  │                           │  │
│  │       [Cancel]            │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

#### Buttons
| Button | Action | Source |
|--------|--------|--------|
| Cancel | Confirmation alert → `handleCancelBooking()` → `setStep("home")` | `src/App.tsx:2823` |

#### Background Logic (`src/App.tsx:2609`)
- Broadcasts `REQUEST_RIDE` to rider channels every 4 seconds — `src/App.tsx:2670`
- Listens for `RIDE_ACCEPTED` broadcast from any rider — `src/App.tsx:2954`
- On `RIDE_ACCEPTED`: sets `activeRider` → shows "Rider found!" toast → `setStep("matched")`
- Broadcasts `USER_CONFIRMED_RIDER` to confirm the matched rider — `src/App.tsx:2961`

---

### 4.4 Matched Screen

> Component: `MatchedPanel` — `src/App.tsx:19128`

**Purpose**: Active ride screen showing rider info, route, and fare.

#### Layout
```
┌─────────────────────────────────┐
│  [Map — live rider location]    │
│  [Blue: device, Orange: rider]  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ [Avatar] Name ⭐4.8 (120) │  │
│  │ Vehicle: Honda Click 125  │  │
│  │ Plate: ABC 1234           │  │
│  │                           │  │
│  │ ETA: Arriving in 5 min    │  │
│  │ 📍 Pickup → 🔵 Dropoff    │  │
│  │                           │  │
│  │ Fare Breakdown:           │  │
│  │   Base Fare      ₱40      │  │
│  │   Distance 5km   ₱60      │  │
│  │   Time 12min     ₱24      │  │
│  │   Booking Fee    ₱5       │  │
│  │   Voucher       −₱20      │  │
│  │   ─────────────────────   │  │
│  │   Total          ₱109     │  │
│  │                           │  │
│  │ [Recent Reviews...]       │  │
│  │                           │  │
│  │  [💬 Chat]   [📞 Call]   │  │
│  │         [Cancel]          │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

#### Rider Info Card
| Element | Data Source |
|---------|------------|
| Avatar | `activeRider.avatar_url` |
| Name | `activeRider.first_name + last_name` |
| Rating | Average of all ride ratings |
| Ride count | Total completed rides |
| Vehicle | `activeRider.vehicle_make + model` |
| Plate | `activeRider.plate_number` |

Tap vehicle photo → full-screen vehicle photo modal

#### Status Phases
| Phase | Status Text | Map Route |
|-------|-------------|-----------|
| Rider en route to pickup | "Rider is on the way" | Orange: rider → you |
| Rider arrived (`RIDER_ARRIVED` received — `src/App.tsx:2981`) | "Your rider has arrived!" | — |
| Ride in progress | "On the way to destination" | Green: you → destination |
| Ride completed (`RIDE_COMPLETED` received — `src/App.tsx:3021`) | "You have arrived!" | — |

#### Buttons
| Button | Action | Source |
|--------|--------|--------|
| 💬 Chat | Opens `RealtimeChat` modal | `src/App.tsx:17253` |
| 📞 Call | Opens `tel:` phone link | `src/App.tsx:19128` |
| Cancel | Cancellation confirmation modal | `src/App.tsx:3961` |

#### Cancel Modal
```
"Cancel your ride?"
You may be charged a cancellation fee.

[Keep Ride]    [Yes, Cancel]
```
- "Keep Ride" → dismisses modal
- "Yes, Cancel" → `handleCancelBooking(true)` — `src/App.tsx:2823` → broadcast `CANCEL_RIDE` — `src/App.tsx:2827` → `setStep("home")`

#### Live Location Updates (`src/App.tsx:2975`)
- Listens for `RIDER_LOCATION` broadcast (updates every ~2s)
- Updates rider marker on map
- Recalculates ETA from OSRM using updated rider coords

---

### 4.5 Review Screen

> Component: `RatingPanel` — `src/App.tsx:19654`

**Purpose**: Rate the completed ride.

#### Layout
```
┌─────────────────────────────────┐
│  [Rider Avatar in ring frame]   │
│  Rate your ride with [Name]     │
│                                 │
│  ⭐ ⭐ ⭐ ⭐ ⭐  (tappable)       │
│  "Excellent!"  (label)          │
│                                 │
│  [Friendly] [Safe Driver]       │
│  [On Time] [Clean Vehicle]      │
│  [Professional]                 │
│                                 │
│  [Comment textarea — optional]  │
│                                 │
│  [Skip]          [Submit ★]     │
└─────────────────────────────────┘
```

#### Star Rating
| Stars | Label |
|-------|-------|
| 1 | Poor |
| 2 | Fair |
| 3 | Good |
| 4 | Great |
| 5 | Excellent! |

#### Quick Tags (show only on 4–5 stars)
- Friendly
- Safe Driver
- On Time
- Clean Vehicle
- Professional

Tapping a tag toggles it in the comment text.

#### Buttons
| Button | State | Action | Source |
|--------|-------|--------|--------|
| Skip | Always | Closes screen without submitting | `src/App.tsx:19654` |
| Submit | Disabled | 0 stars selected | — |
| Submit | Enabled | Updates ride with `rating`, `comment` → success checkmark → auto-close 1.8s → `setStep("home")` | `src/App.tsx:19654` |

After submission, calls `markVoucherUsed()` if a voucher was applied — `src/lib/voucherService.ts:227`.

---

## 5. Rider Dashboard — Full Flow

> Component: `RiderDashboard` — `src/App.tsx:5623`

### Rider State Machine

```
[OFFLINE]
    │
    ▼
[ONLINE — waiting]  ← sets is_online: true in DB
    │
    ├─► REQUEST_RIDE received  [src/App.tsx:6239]
    │         │
    │         ├─ Decline ──► RIDE_DECLINED broadcast  [src/App.tsx:7477]
    │         │              back to waiting
    │         │
    │         └─ Accept ──► RIDE_ACCEPTED broadcast  [src/App.tsx:7590]
    │                       [WAITING FOR USER CONFIRM]
    │                             │
    │                             └─ USER_CONFIRMED_RIDER received  [src/App.tsx:6283]
    │                                ──► [ON TRIP] → RiderActiveRide  [src/App.tsx:4890]
    │                                                     │
    │                                                     ├─ Pickup phase
    │                                                     │     └─ "Arrive at Pickup"
    │                                                     │           → RIDER_ARRIVED  [src/App.tsx:6519]
    │                                                     │
    │                                                     └─ Dropoff phase
    │                                                           └─ "Complete Ride"
    │                                                                 → RIDE_COMPLETED  [src/App.tsx:6501]
    │
    └─ Sign out / go offline ──► [OFFLINE]
```

### Rider Global State

| State Variable | Type | Purpose |
|----------------|------|---------|
| `isOnline` | `boolean` | Online/offline toggle |
| `currentRequest` | `RideRequest \| null` | Active incoming request |
| `incomingRequests` | `RideRequest[]` | Pending request queue (max 5) |
| `requestAccepted` | `boolean` | Ride has been accepted |
| `waitingForUserConfirm` | `boolean` | Waiting for user to confirm this rider |
| `showActiveRide` | `boolean` | Shows `RiderActiveRide` screen |
| `riderCurrentLoc` | `[lat, lon]` | Current GPS coords |
| `activeTab` | `"home" \| "history" \| "remit" \| "team" \| "news"` | Current tab |

---

### 5.1 Dashboard Home Tab

> `src/App.tsx:5623`

#### Header Area
| Element | Description | Source |
|---------|-------------|--------|
| App Logo | Branding | `src/lib/settingsService.ts:13` |
| Rider Name + Email | Profile info | `getProfile()` — `src/lib/supabase.ts:83` |
| Status Badge | "ONLINE" (green) / "OFFLINE" (gray) / "ON TRIP" (blue) | `src/App.tsx:5623` |
| 💬 Chat button | Opens `ChatHistoryScreen` | `src/App.tsx:17727` |
| 🔔 Notifications | Opens notifications drawer (with unread badge) | `src/lib/notificationService.ts:6` |
| 👤 Avatar | Opens profile edit | `src/lib/supabase.ts:93` |
| Sign Out | `signOut()` | `src/lib/supabase.ts:79` |

#### Online Toggle

```
[Go Online ▶]   or   [● ONLINE — Go Offline]
```

**Go Online action** (`src/App.tsx:6086`):
1. Requests GPS permission
2. Starts GPS watch (updates every 30s or >50m movement)
3. `updateProfile(userId, { is_online: true })` — `src/lib/supabase.ts:93`
4. Starts listening for `REQUEST_RIDE` broadcasts — `src/App.tsx:6239`
5. Registers FCM push notification token — `src/lib/fcmService.ts`

**Go Offline action:**
1. `updateProfile(userId, { is_online: false, last_lat: null, last_lng: null })` — `src/lib/supabase.ts:93`
2. Clears `incomingRequests`
3. Stops GPS watch

#### Location Permission Denied Banner
Shown when geolocation is denied:
```
⚠ Location access required to go online.
[Enable Location]
```

#### Active Ride Banner (when `requestAccepted && currentRequest`)
```
🔵 On Trip — [Passenger Name] from [Pickup]
                              [View Ride ▶]
```
- "View Ride" button → `setShowActiveRide(true)` → opens `RiderActiveRide` — `src/App.tsx:4890`

---

### 5.2 Incoming Request Card

> `src/App.tsx:6204` — `scheduleRequest()` manages the queue

Shown when a `REQUEST_RIDE` event (`src/App.tsx:6239`) arrives within 10km radius.

#### Layout
```
┌───────────────────────────────┐
│  New Ride Request!            │
│  [Avatar] Passenger Name      │
│  📍 Pickup address            │
│  🔵 Dropoff address           │
│  Distance: 5.2 km             │
│  Fare: ₱109                   │
│                               │
│  [⏱ Countdown timer]         │
│                               │
│  [✕ Decline]   [✓ Accept]    │
└───────────────────────────────┘
```

#### Queue Behavior
- Up to 5 requests queued — `src/App.tsx:6204`
- Requests expire after 8 seconds without refresh
- Declined requests tracked in `declinedRidersRef` and excluded from future rounds

#### Buttons
| Button | Action | Source |
|--------|--------|--------|
| Decline | Broadcasts `RIDE_DECLINED` → next request shown | `src/App.tsx:7477` |
| Accept | Updates ride `status: "accepted"`, `rider_id` → broadcasts `RIDE_ACCEPTED` → sets `waitingForUserConfirm: true` | `src/App.tsx:7590` |

#### After Accepting — Waiting State
```
┌───────────────────────────────┐
│  ⏳ Waiting for passenger...  │
│  Connecting you to the ride   │
│  [animated spinner]           │
└───────────────────────────────┘
```
- Listens for `USER_CONFIRMED_RIDER` broadcast — `src/App.tsx:6283`
- On receive → `setShowActiveRide(true)` → opens `RiderActiveRide` — `src/App.tsx:4890`

---

### 5.3 Active Ride Screen

> Component: `RiderActiveRide` — `src/App.tsx:4890`

Full-screen screen that replaces the dashboard during a trip.

#### Map Layer
| Marker | Color | Represents |
|--------|-------|-----------|
| Car icon | Blue | Rider current location |
| Pin (pickup phase) | Orange | Passenger pickup point |
| Pin (dropoff phase) | Green | Destination |
| Dashed line | Orange/Green | Direct path to target |
| Solid line | Orange/Green | OSRM road-snapped route |

#### Map Control Buttons
| Button | Action |
|--------|--------|
| Navigation icon | Re-centers map on rider location |
| North icon | Resets map to north-up orientation |

#### Bottom Panel (collapsible)

**Collapsed Header (always visible):**
```
[Avatar] [Name]  [Status text]  [₱ Fare]  [💬] [📞]  [▲]
```

**Expanded Details:**
```
┌─────────────────────────────────┐
│  Passenger: Name                │
│  📞 Phone number (tappable)     │
│                                 │
│  📍 Pickup address              │
│     │                           │
│  🔵 Dropoff address             │
│                                 │
│  Fare Breakdown:                │
│    Base Fare        ₱40         │
│    Distance 5km     ₱60         │
│    Time 12min       ₱24         │
│    Booking Fee      ₱5          │
│    Voucher         −₱20         │
│    ───────────────────          │
│    Total            ₱109        │
└─────────────────────────────────┘
```

#### Ride Phases & Action Button

**Phase 1 — Pickup** (navigating to passenger)
```
[🧡 Arrive at Pickup]
```
- Action: Broadcasts `RIDER_ARRIVED` — `src/App.tsx:6519` → switches to dropoff phase
- Side panel status: "Heading to pickup"

**Phase 2 — Dropoff** (navigating to destination)
```
[✅ Complete Ride]
```
- Action: Updates ride `status: "completed"`, `completed_at` — broadcasts `RIDE_COMPLETED` — `src/App.tsx:6501` → returns to dashboard

#### Cancel Button (`src/App.tsx:5601`)
```
[Cancel Booking]  ← text-only at bottom
```
- Shows confirmation modal:
  ```
  "Cancel your ride?"
  [Keep Ride]    [Yes, Cancel]
  ```
- "Yes, Cancel" → `handleRiderCancel()` — `src/App.tsx:4931`:
  - Broadcasts `RIDE_CANCELLED` with `riderId` — `src/App.tsx:4935`
  - Resets ride `status: "pending"`, clears `rider_id`
  - User's app shows "Rider cancelled, finding new rider..."
  - Rider returns to dashboard

#### Chat Button (in panel)
- Shows unread message badge count
- Opens `RealtimeChat` — `src/App.tsx:17253` in a full-screen overlay
- Real-time subscription via `subscribeToMessages()` — `src/lib/chatService.ts:92`

#### Location Broadcasting (`src/App.tsx:5011`)
- GPS updates broadcast via `RIDER_LOCATION` every ~2 seconds
- Writes `last_lat`, `last_lng` to profiles table via `updateProfile()` — `src/lib/supabase.ts:93`
- User map marker updates in real time — `src/App.tsx:2975`

#### Offline Route Cache (`src/App.tsx:5110`)
- Route saved to localStorage on each update
- Badge shows: "Offline map active" / "Saving offline map..."
- Falls back to direct line if OSRM fails

---

### 5.4 History Tab

> `src/App.tsx:5623` (within `RiderDashboard`, tab `"history"`)

#### Layout
```
┌─────────────────────────────────┐
│  ← Today  [Date Picker]  →      │
│                                 │
│  Summary Cards:                 │
│  [🚗 5 Trips] [₱450 Earned] [⭐4.9 Avg] │
│                                 │
│  Trip List:                     │
│  ┌─────────────────────────┐    │
│  │ [Avatar] Passenger Name │    │
│  │ 📍 Pickup → Dropoff     │    │
│  │ ₱90  ⭐5  10:30 AM      │    │
│  └─────────────────────────┘    │
│  [... more trips ...]           │
└─────────────────────────────────┘
```

#### Date Picker
- Shows current day by default
- Arrows to navigate days
- Cannot select future dates

#### Summary Cards
| Card | Data |
|------|------|
| Trips | Count of completed rides for selected day |
| Earned | Sum of `fare` minus voucher discounts |
| Avg Rating | Average of ride ratings that day |

#### Trip Row (tappable)
- Opens trip detail modal with full receipt:
  - Passenger info
  - Route (pickup → dropoff)
  - Full fare breakdown
  - Rating given by passenger

---

### 5.5 Remittance Tab

> Enabled/disabled via `app_settings.remittance_enabled` — `src/lib/settingsService.ts:3`
> Service: `src/lib/remittanceService.ts`

#### Layout
```
┌─────────────────────────────────┐
│  ← [Date]  →                    │
│                                 │
│  Today's Summary:               │
│  Rides: 5 | Earnings: ₱450      │
│  Booking Fee Due: ₱25           │
│  Team Discount: −₱5             │
│  Net Remittance: ₱20            │
│                                 │
│  [Upload Receipt / Proof]       │
│                                 │
│  Remittance History:            │
│  [pending] [approved] [rejected]│
└─────────────────────────────────┘
```

#### Daily Stats
- Computed via `getRiderDailyStats(riderId, date)` — `src/lib/remittanceService.ts:61`
- Queries `rides` table for completed rides on that date

#### Remittance Status Flow
```
pending → approved   (via reviewRemittance — src/lib/remittanceService.ts:140)
       → rejected
```

#### Buttons
| Button | Action | Source |
|--------|--------|--------|
| Upload Receipt | Image picker → `uploadReceipt(riderId, file)` → creates/updates remittance row | `src/lib/remittanceService.ts:93` |
| View QR Code | Shows admin payment QR from `app_settings.remittance_qr_url` | `src/lib/settingsService.ts:13` |

---

### 5.6 Team Tab (Team Leaders Only)

> Only visible when `profile.role === "team_leader"`
> Service: `src/lib/teamService.ts`

#### Subtabs
1. **Members** — `fetchTeamWithMembers(teamId)` — `src/lib/teamService.ts:33`
   - Each member row: avatar, name, status badge
   - Remove: `removeTeamMember(teamId, riderId)` — `src/lib/teamService.ts:91`
   - "Add Member": `addTeamMember(teamId, riderId)` — `src/lib/teamService.ts:85`

2. **Remittances** — `getTeamRemittances(riderIds[])` — `src/lib/remittanceService.ts:162`
   - Date picker
   - Each member row: name, amount due, status badge (pending/approved/rejected)

---

### 5.7 News Tab

> Service: `src/lib/newsService.ts`

#### Layout
```
┌─────────────────────────────────┐
│  📢 News & Announcements  [3]   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ [Image] Title           │   │
│  │ Category • Date         │   │
│  │ Preview text...         │   │
│  └─────────────────────────┘   │
│  [... more posts ...]          │
└─────────────────────────────────┘
```

- Posts fetched via `fetchNewsPosts()` — `src/lib/newsService.ts:27`
- Only `published: true, is_archived: false` shown to non-admins

#### Post Card (tappable)
- Opens full post modal
- Marks post as read (clears badge count)
- Shows: title, category, full content, image

#### News Categories (`src/lib/newsService.ts:5`)
`Announcement | Update | Promo | Event | Important`

---

## 6. Shared: Real-time Chat

> Component: `RealtimeChat` — `src/App.tsx:17253`
> History screen: `ChatHistoryScreen` — `src/App.tsx:17727`
> Service: `src/lib/chatService.ts`

Used in both User (Matched screen) and Rider (Active Ride screen).

### Chat Screen Layout
```
┌─────────────────────────────────┐
│ ← [Avatar] Name  [● Online]     │
├─────────────────────────────────┤
│                                 │
│        [Date separator]         │
│                                 │
│  [Other msg bubble]    10:30 AM │
│                                 │
│           10:31 AM  [My bubble] │
│                                 │
│              ...                │
│                                 │
├─────────────────────────────────┤
│ [😊] [Type a message...]  [Send]│
└─────────────────────────────────┘
```

### Message Bubble Styling
| Type | Alignment | Background |
|------|-----------|------------|
| Own message | Right | Emerald green |
| Other message | Left | White / light gray |

### Buttons
| Button | Action | Source |
|--------|--------|--------|
| ← Back | Closes chat, returns to ride screen | `src/App.tsx:17253` |
| 😊 Emoji | Opens emoji picker (optional for RN) | — |
| Send | Disabled when empty; `sendMessage(rideId, content)` | `src/lib/chatService.ts:43` |

### Real-time Subscription (`src/lib/chatService.ts:92`)
```
subscribeToMessages(rideId, callback)
  → Supabase realtime channel: "messages"
  → postgres_changes on INSERT
  → Deduplicates, skips own optimistic messages
  → Fallback polling every 3s
```

### Message Data Model (`src/lib/chatService.ts:25`)
```typescript
{
  id: string
  ride_id: string
  sender_id: string
  sender_role: "user" | "rider"
  sender_name: string
  content: string
  created_at: string  // ISO 8601
}
```

### Send Flow (`src/lib/chatService.ts:43`)
1. Add optimistic message to UI immediately
2. `sendMessage(rideId, senderId, senderRole, senderName, content)` saves to DB
3. Replace optimistic message with real one on success
4. Show error banner + remove message if fails

### Chat History Screen — `src/App.tsx:17727`
- User conversations: `fetchUserConversations(userId)` — `src/lib/chatService.ts:146`
- Rider conversations: `fetchRiderConversations(riderId)` — `src/lib/chatService.ts:191`
- Grouped by other participant's name, most recent first
- Tap → opens that chat

---

## 7. Shared: Notifications

> Service: `src/lib/notificationService.ts`

### In-App Notifications Drawer
Accessible from the bell icon in the header.

| Event | Notification |
|-------|-------------|
| Rider accepted ride | "Rider found! [Name] is on the way." |
| Rider arrived | "Your rider has arrived!" |
| Ride completed | "You have arrived at [Destination]!" |
| Rider cancelled | "Rider cancelled. Finding a new rider..." |
| New news post | "📢 [Post Title]" |
| Connection restored | "Back online" |

### Push Notifications (FCM) — `src/lib/fcmService.ts`
- Sent to riders when a `REQUEST_RIDE` broadcast fires
- Shows natively on device when app is backgrounded
- On tap → opens app and shows the request

### Toast Notifications
- Ephemeral, auto-dismiss after 3–3.5 seconds
- Shown inline at top of screen
- Various states: info (blue), success (green), warning (yellow), error (red)

### Notification API (`src/lib/notificationService.ts`)
| Function | Line | Purpose |
|----------|------|---------|
| `requestNotificationPermission()` | `src/lib/notificationService.ts:6` | One-time OS permission prompt |
| `pushNotification(title, body)` | `src/lib/notificationService.ts:15` | Native OS notification |

---

## 8. Vouchers & Discounts

> Service: `src/lib/voucherService.ts`

### Voucher Data Model (`src/lib/voucherService.ts:7`)
```typescript
{
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  min_distance_km: number | null
  min_fare: number | null
  valid_from: string   // ISO date
  valid_until: string  // ISO date
  is_active: boolean
  max_uses: number | null
  used_count: number
}
```

### Redeem Voucher Flow (User)
1. User opens "My Vouchers" screen
2. Types code — normalized via `normalizeVoucherCode(code)` — `src/lib/voucherService.ts:46`
3. Taps "Redeem" → `addVoucherToUser(userId, code)` — `src/lib/voucherService.ts:177`
4. Validation checks via `isVoucherInWindow()` — `src/lib/voucherService.ts:50`:
   - Code exists, `is_active: true`, not expired, not past `max_uses`, not already redeemed
5. Success: voucher appears in user's list
6. Error: inline message (e.g., "Code not found", "Already used")

### Apply Voucher at Booking
- Listed via `fetchUserVouchers(userId)` — `src/lib/voucherService.ts:147`
- Validated via `getVoucherRideIssue()` — `src/lib/voucherService.ts:69`
- Discount computed via `calculateVoucherDiscount(voucher, fare)` — `src/lib/voucherService.ts:57`
- Marked used on ride completion via `markVoucherUsed()` — `src/lib/voucherService.ts:227`

---

## 9. Real-time Broadcast Events

All events use Supabase broadcast channels.

### Channel Structure
| Channel | Used For |
|---------|---------|
| `"rides"` | Global ride events (all riders receive) |
| `"ride:{rideId}"` | Ride-specific events (passenger + rider) |
| `"rider:{riderId}"` | Direct to specific rider |

### User → System → Riders
| Event | Payload | Sent (`src/App.tsx`) | Received (`src/App.tsx`) |
|-------|---------|---------------------|--------------------------|
| `REQUEST_RIDE` | `{ rideId, userId, pickup, pickupCoords, dropoff, dropoffCoords, fare, rideType, targetRiderIds? }` | `:2670` | `:6239` |
| `CANCEL_RIDE` | `{ rideId }` | `:2827` | `:6252` |
| `USER_CONFIRMED_RIDER` | `{ rideId, riderId }` | `:2961` | `:6283` |

### Rider → User
| Event | Payload | Sent (`src/App.tsx`) | Received (`src/App.tsx`) |
|-------|---------|---------------------|--------------------------|
| `RIDE_ACCEPTED` | `{ rideId, rider: RiderProfile }` | `:7590` | `:2954` |
| `RIDER_LOCATION` | `{ rideId, lat, lng }` | `:5011` | `:2975` |
| `RIDER_ARRIVED` | `{ rideId }` | `:6519` | `:2981` |
| `RIDE_COMPLETED` | `{ rideId }` | `:6501` | `:3021` |
| `RIDE_CANCELLED` | `{ rideId, riderId }` | `:4935` | `:2995` |
| `RIDE_DECLINED` | `{ rideId, riderId }` | `:7477` | `:2637` |

---

## 10. Cancellation Flows

### User Cancels While Searching (`src/App.tsx:2823`)
```
[Cancel button — src/App.tsx:19072]
  → handleCancelBooking()  [src/App.tsx:2823]
      → Broadcasts CANCEL_RIDE  [src/App.tsx:2827]
      → Updates ride status: "cancelled"
      → Clears: currentRideId, step, pickup, dropoff, fare state
      → setStep("home")
```

### User Cancels While Matched (`src/App.tsx:3961`)
```
[Cancel button — src/App.tsx:19128]
  → Modal: "Cancel your ride? You may be charged a fee."
  → [Keep Ride] → dismiss modal
  → [Yes, Cancel] → handleCancelBooking(true)  [src/App.tsx:2823]
      → Broadcasts CANCEL_RIDE  [src/App.tsx:2827]
      → Updates ride status: "cancelled"
      → Clears all ride state
      → setStep("home")
```

### Rider Cancels After Accepting (`src/App.tsx:4931`)
```
[Cancel Booking button — src/App.tsx:5601]
  → Modal: "Cancel your ride?"
  → [Keep Ride] → dismiss modal
  → [Yes, Cancel] → handleRiderCancel()  [src/App.tsx:4931]
      → Broadcasts RIDE_CANCELLED { rideId, riderId }  [src/App.tsx:4935]
      → Resets ride: status → "pending", rider_id → null
      → Clears rider's ride state
      → User sees: "Rider cancelled. Finding a new rider..."
      → Search loop re-dispatches to other riders  [src/App.tsx:2609]
```

---

## 11. State Persistence & Recovery

### User Ride (localStorage key: `biyahero_user_ride`)
> Saved/restored within `UserApp` — `src/App.tsx:2398`

```typescript
{
  currentRideId: string
  step: "searching" | "matched"
  pickup: string
  pickupCoords: [number, number]
  dropoff: string
  destinationCoords: [number, number]
  selectedRide: "moto" | "eco" | "premium"
  fareBreakdown: FareBreakdown          // src/lib/fareService.ts:25
  selectedUserVoucher: Voucher | null   // src/lib/voucherService.ts:7
  voucherDiscount: number
  activeRider: RiderProfile | null
}
```

- On restore: shows toast "Resumed your active booking"
- Sync check: fetches ride from DB; if `completed` or `cancelled`, clears state

### Rider Ride (localStorage key: `biyahero_rider_ride`)
> Saved/restored within `RiderDashboard` — `src/App.tsx:5623`

```typescript
{
  currentRequest: RideRequest
  requestAccepted: boolean
}
```

- On restore: shows banner "Resumed your active ride"
- Sync check prevents zombie broadcasts on stale state

> **React Native Note**: Replace `localStorage` with `AsyncStorage` or `MMKV` for persistence.

---

## 12. Maintenance Mode

> Service: `src/lib/maintenanceService.ts`
> Settings: `getAppSettings()` — `src/lib/settingsService.ts:13`

Configurable from admin settings. Three modes:

| Mode | Behavior |
|------|---------|
| `off` | Normal operation |
| `half` | Remittances and certain features disabled; riders can still work |
| `full` | Full shutdown screen shown; only admins can access |

### Maintenance Banners
- **Marquee Banner**: Yellow sticky bar with maintenance message (shown in `half` mode)
- **Full Maintenance Screen**: Replaces entire app UI (shown in `full` mode)

---

## 13. Pricing Model

> Service: `src/lib/fareService.ts`

### Default Fare Tiers (`src/lib/fareService.ts:36`)

| Tier | Base | Per-km | Per-min | Booking Fee |
|------|------|--------|---------|-------------|
| Moto | ₱40 | ₱12 | ₱2 | ₱5 |
| Eco | ₱60 | ₱18 | ₱3 | ₱8 |
| Premium | ₱100 | ₱30 | ₱5 | ₱12 |

### Fare Formula — `calculateFare()` (`src/lib/fareService.ts:82`)
```
totalFare = baseFare
          + (distanceKm * perKmRate)       // after free-km threshold if set
          + (durationMin * perMinRate)
          + bookingFee
          − voucherDiscount
```

### Config Loading
- `loadPricingConfig()` — `src/lib/fareService.ts:113` — reads from localStorage
- `loadPricingConfigFromDB()` — `src/lib/fareService.ts:136` — reads from Supabase
- `savePricingConfigToDB()` — `src/lib/fareService.ts:160` — admin saves changes

### Remittance (Booking Fee)
- Riders remit the `bookingFee` portion daily
- Team members may receive a discount on the fee
- Proof of remittance uploaded as image (GCash/bank screenshot)
- Admin approves or rejects via `reviewRemittance()` — `src/lib/remittanceService.ts:140`

---

## 14. External APIs

### Nominatim (Location Search)
```
GET https://nominatim.openstreetmap.org/search
  ?q={query}
  &format=json
  &addressdetails=1
  &limit=5
  &viewbox=118.3,4.5,127.5,10.2  // Mindanao bounding box
  &bounded=1
```
- No API key required
- 500ms debounce, min 3 characters
- Returns `[{ display_name, lat, lon }]`
- Used in `HomePanel` — `src/App.tsx:17943`

### OSRM (Route Calculation)
```
GET https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}
  ?overview=full
  &geometries=geojson
```
- No API key required
- **Note**: Nominatim returns `[lon, lat]`; Leaflet/RN maps use `[lat, lon]` — convert before passing to OSRM
- Used in `SelectPanel` — `src/App.tsx:18417` and `RiderActiveRide` — `src/App.tsx:4890`

---

## 15. Data Models

### Profile (`src/lib/supabase.ts:29`)
```typescript
{
  id: string                    // = auth.uid
  email: string
  first_name: string
  last_name: string
  phone: string
  avatar_url: string | null
  cover_url: string | null
  role: "user" | "rider" | "team_leader" | "admin" | "super_admin"
  is_online: boolean            // riders only
  last_lat: number | null       // riders only
  last_lng: number | null       // riders only
  vehicle_make: string | null   // riders only
  vehicle_model: string | null  // riders only
  plate_number: string | null   // riders only
  rider_status: "unsubmitted" | "pending" | "approved" | "rejected"
}
```

### FareBreakdown (`src/lib/fareService.ts:25`)
```typescript
{
  baseFare: number
  distanceFee: number
  timeFee: number
  bookingFee: number
  totalFare: number
}
```

### Ride (Supabase table: `rides`)
```typescript
{
  id: string
  user_id: string
  rider_id: string | null
  status: "pending" | "accepted" | "completed" | "cancelled"
  pickup: string
  pickup_lat: number
  pickup_lng: number
  dropoff: string
  dropoff_lat: number
  dropoff_lng: number
  ride_type: "moto" | "eco" | "premium"
  fare: number
  booking_fee: number
  voucher_id: string | null
  voucher_discount: number
  rating: number | null
  comment: string | null
  created_at: string
  completed_at: string | null
  pickup_coords: [number, number][]  // stored route geometry
  dropoff_coords: [number, number][] // stored route geometry
}
```

### ChatMessage (`src/lib/chatService.ts:25`)
```typescript
{
  id: string
  ride_id: string
  sender_id: string
  sender_role: "user" | "rider"
  sender_name: string
  content: string
  created_at: string
}
```

### Remittance (`src/lib/remittanceService.ts:6`)
```typescript
{
  id: string
  rider_id: string
  remittance_date: string  // YYYY-MM-DD
  total_earnings: number
  total_booking_fee: number
  amount_remitted: number
  receipt_url: string | null
  status: "pending" | "approved" | "rejected"
}
```

### AppSettings (`src/lib/settingsService.ts:3`)
```typescript
{
  id: 1
  app_name: string
  document_title: string
  app_logo_url: string | null
  remittance_qr_url: string | null
  remittance_enabled: boolean
  maintenance_mode: "off" | "half" | "full"
  maintenance_message: string | null
}
```

### Voucher (`src/lib/voucherService.ts:7`)
```typescript
{
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  min_distance_km: number | null
  min_fare: number | null
  valid_from: string
  valid_until: string
  is_active: boolean
  max_uses: number | null
  used_count: number
}
```

### Team (`src/lib/teamService.ts:4`)
```typescript
{
  id: string
  name: string
  capacity: number
  schedule_days: number[]    // 0=Sun, 1=Mon ... 6=Sat
  leader_id: string
  is_active: boolean
  members?: TeamMember[]
}
```

---

## 16. Source Code Index

Quick lookup for all referenced functions, components, and constants.

### Components (`src/App.tsx`)
| Component | Line | Description |
|-----------|------|-------------|
| `UserApp` | `src/App.tsx:2398` | Full user booking flow |
| `RiderDashboard` | `src/App.tsx:5623` | Rider home, tabs, request queue |
| `RiderActiveRide` | `src/App.tsx:4890` | Active trip map + controls |
| `HomePanel` | `src/App.tsx:17943` | Pickup/dropoff input + map |
| `SelectPanel` | `src/App.tsx:18417` | Ride tier selection + fare |
| `SearchingPanel` | `src/App.tsx:19072` | Searching animation |
| `MatchedPanel` | `src/App.tsx:19128` | Live ride with rider info |
| `RatingPanel` | `src/App.tsx:19654` | Post-ride star rating |
| `RealtimeChat` | `src/App.tsx:17253` | In-ride messaging UI |
| `ChatHistoryScreen` | `src/App.tsx:17727` | All past conversations |

### Key Functions (`src/App.tsx`)
| Function | Line | Description |
|----------|------|-------------|
| `handleCancelBooking()` | `src/App.tsx:2823` | User cancels (any step) |
| `handleRiderCancel()` | `src/App.tsx:4931` | Rider cancels accepted ride |
| `onBook()` | `src/App.tsx:3828` | Creates ride + starts search loop |
| `scheduleRequest()` | `src/App.tsx:6204` | Queues incoming ride requests |

### Broadcast Events (`src/App.tsx`)
| Event | Sent | Received |
|-------|------|---------|
| `REQUEST_RIDE` | `:2670` | `:6239` |
| `CANCEL_RIDE` | `:2827` | `:6252` |
| `USER_CONFIRMED_RIDER` | `:2961` | `:6283` |
| `RIDE_ACCEPTED` | `:7590` | `:2954` |
| `RIDER_LOCATION` | `:5011` | `:2975` |
| `RIDER_ARRIVED` | `:6519` | `:2981` |
| `RIDE_COMPLETED` | `:6501` | `:3021` |
| `RIDE_CANCELLED` | `:4935` | `:2995` |
| `RIDE_DECLINED` | `:7477` | `:2637` |

### Auth & Profile (`src/lib/supabase.ts`)
| Function | Line |
|----------|------|
| `signInWithGoogle()` | `src/lib/supabase.ts:72` |
| `signOut()` | `src/lib/supabase.ts:79` |
| `getProfile(userId)` | `src/lib/supabase.ts:83` |
| `updateProfile(userId, updates)` | `src/lib/supabase.ts:93` |
| `setRiderStatus(userId, status)` | `src/lib/supabase.ts:104` |
| `getRiderProfiles()` | `src/lib/supabase.ts:150` |
| `uploadImage(bucket, userId, file)` | `src/lib/supabase.ts:206` |

### Fare Service (`src/lib/fareService.ts`)
| Function | Line |
|----------|------|
| `DEFAULT_PRICING` | `src/lib/fareService.ts:36` |
| `calculateFare(tier, distKm, durMin, config)` | `src/lib/fareService.ts:82` |
| `loadPricingConfig()` | `src/lib/fareService.ts:113` |
| `loadPricingConfigFromDB()` | `src/lib/fareService.ts:136` |
| `savePricingConfigToDB(config)` | `src/lib/fareService.ts:160` |

### Chat Service (`src/lib/chatService.ts`)
| Function | Line |
|----------|------|
| `sendMessage(...)` | `src/lib/chatService.ts:43` |
| `fetchMessages(rideId)` | `src/lib/chatService.ts:75` |
| `subscribeToMessages(rideId, cb)` | `src/lib/chatService.ts:92` |
| `deleteConversation(rideId, userId)` | `src/lib/chatService.ts:126` |
| `fetchUserConversations(userId)` | `src/lib/chatService.ts:146` |
| `fetchRiderConversations(riderId)` | `src/lib/chatService.ts:191` |

### Voucher Service (`src/lib/voucherService.ts`)
| Function | Line |
|----------|------|
| `normalizeVoucherCode(code)` | `src/lib/voucherService.ts:46` |
| `isVoucherInWindow(voucher)` | `src/lib/voucherService.ts:50` |
| `calculateVoucherDiscount(voucher, fare)` | `src/lib/voucherService.ts:57` |
| `getVoucherRideIssue(voucher, distKm, fare)` | `src/lib/voucherService.ts:69` |
| `fetchUserVouchers(userId)` | `src/lib/voucherService.ts:147` |
| `addVoucherToUser(userId, code)` | `src/lib/voucherService.ts:177` |
| `markVoucherUsed(voucherId, userId)` | `src/lib/voucherService.ts:227` |

### Remittance Service (`src/lib/remittanceService.ts`)
| Function | Line |
|----------|------|
| `getRiderRemittances(riderId)` | `src/lib/remittanceService.ts:25` |
| `getRiderDailyStats(riderId, date)` | `src/lib/remittanceService.ts:61` |
| `uploadReceipt(riderId, file)` | `src/lib/remittanceService.ts:93` |
| `createRemittance(data)` | `src/lib/remittanceService.ts:108` |
| `reviewRemittance(id, status)` | `src/lib/remittanceService.ts:140` |
| `getTeamRemittances(riderIds[])` | `src/lib/remittanceService.ts:162` |

### Team Service (`src/lib/teamService.ts`)
| Function | Line |
|----------|------|
| `fetchMyTeam(leaderId)` | `src/lib/teamService.ts:42` |
| `fetchTeamWithMembers(teamId)` | `src/lib/teamService.ts:33` |
| `fetchRiderMembership(riderId)` | `src/lib/teamService.ts:70` |
| `addTeamMember(teamId, riderId)` | `src/lib/teamService.ts:85` |
| `removeTeamMember(teamId, riderId)` | `src/lib/teamService.ts:91` |

### Other Services
| Function | File | Line |
|----------|------|------|
| `fetchNewsPosts(includeAll?)` | `src/lib/newsService.ts` | `:27` |
| `getAppSettings()` | `src/lib/settingsService.ts` | `:13` |
| `updateAppSettings(settings)` | `src/lib/settingsService.ts` | `:27` |
| `requestNotificationPermission()` | `src/lib/notificationService.ts` | `:6` |
| `pushNotification(title, body)` | `src/lib/notificationService.ts` | `:15` |

---

## React Native Migration Notes

| Web | React Native Equivalent |
|-----|------------------------|
| `localStorage` | `AsyncStorage` or `MMKV` |
| Leaflet map | `react-native-maps` + MapLibre/Mapbox |
| CSS animations | `react-native-reanimated` |
| `window.navigator.geolocation` | `expo-location` or `react-native-geolocation-service` |
| `tel:` links | `Linking.openURL('tel:...')` |
| File input / image picker | `expo-image-picker` |
| Supabase JS client | Same `@supabase/supabase-js` (works in RN) |
| Google OAuth popup | `@react-native-google-signin/google-signin` |
| Push notifications (FCM) | `expo-notifications` or `react-native-firebase` |
| `fetch` API | Same (available globally in RN) |
| CSS Tailwind | `NativeWind` or StyleSheet |
| Framer Motion | `react-native-reanimated` / `moti` |
| `DivIcon` markers | Custom `Marker` with `View` callout |
| Nominatim geocoder | Same API endpoint via `fetch` |
| OSRM routing | Same API endpoint via `fetch` |

---

*Last updated: 2026-05-12*
