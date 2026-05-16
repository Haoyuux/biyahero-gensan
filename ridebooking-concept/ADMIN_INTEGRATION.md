# BiyaHero — Admin Dashboard Integration Reference

> Complete documentation of all Admin modules, features, interfaces, and API functions.
> Use this as the single source of truth when building or integrating admin-facing features into ridebooking-mobile.
>
> Source references use the format `src/path/file.ts:LINE` — open the file at that line to see the implementation.

---

## Table of Contents

1. [Admin Roles & Access Model](#1-admin-roles--access-model)
2. [Admin Dashboard Structure](#2-admin-dashboard-structure)
3. [Module: Live Operations](#3-module-live-operations)
4. [Module: Driver Management](#4-module-driver-management)
5. [Module: Rider Verification](#5-module-rider-verification)
6. [Module: Team Management](#6-module-team-management)
7. [Module: News Feed](#7-module-news-feed)
8. [Module: Booking Analytics](#8-module-booking-analytics)
9. [Module: Revenue Dashboard](#9-module-revenue-dashboard)
10. [Module: Ride Reviews](#10-module-ride-reviews)
11. [Module: Remittances](#11-module-remittances)
12. [Module: User Management](#12-module-user-management)
13. [Module: Pricing Config](#13-module-pricing-config)
14. [Module: User Blocking](#14-module-user-blocking)
15. [Module: App Settings](#15-module-app-settings)
16. [Module: Maintenance Mode](#16-module-maintenance-mode)
17. [Module: Vouchers](#17-module-vouchers)
18. [Module: Roles & Permissions (Super Admin Only)](#18-module-roles--permissions-super-admin-only)
19. [Data Models](#19-data-models)
20. [API Reference](#20-api-reference)

---

## 1. Admin Roles & Access Model

### Role Hierarchy

| Role | Access | Source |
|------|--------|--------|
| `user` | Passenger booking only | — |
| `rider` | Rider dashboard only | — |
| `team_leader` | Rider dashboard + Team & Remittance tabs | — |
| `admin` | Admin dashboard (limited by assigned role modules) | `src/App.tsx:877` |
| `super_admin` | Full admin dashboard + Roles & Permissions tab + impersonation | `src/App.tsx:877` |

### AdminRole Data Model (`src/lib/supabase.ts:112`)

```typescript
{
  id: string
  name: string
  description: string | null
  modules: AdminTab[]   // array of module IDs this role can access
  created_at: string
}
```

### Profile Admin Fields (`src/lib/supabase.ts:57`)

```typescript
{
  admin_role_id: string | null   // legacy single role (deprecated)
  admin_role_ids: string[]       // current: array of assigned role IDs
}
```

### Access Resolution Logic (`src/App.tsx:11652`)

- `super_admin` → sees all tabs + Roles tab
- `admin` with role assignments → sees union of all modules from all assigned roles
- `admin` with no role assignments → sees no tabs (blocked)

---

## 2. Admin Dashboard Structure

### Component: `AdminDashboard` — `src/App.tsx:11080`

```typescript
props: {
  profile: Profile
  isSuperAdmin: boolean
  settings: AppSettings | null
  onRefreshSettings: () => void
  onImpersonate?: (p: Profile) => void   // super_admin only
  maintenanceSettings?: MaintenanceSettings | null
}
```

### All Available Tabs (AdminTab type — `src/App.tsx:10312`)

| Tab ID | Label | Icon | Super Admin Only |
|--------|-------|------|-----------------|
| `live` | Live Operations | Activity | No |
| `drivers` | Driver Management | Users | No |
| `riders` | Rider Verification | FileText | No |
| `teams` | Team Management | Users2 | No |
| `news` | News Feed | Newspaper | No |
| `analytics` | Booking Analytics | TrendingUp | No |
| `finances` | Revenue Dashboard | BarChart | No |
| `reviews` | Ride Reviews | Star | No |
| `remittances` | Remittances | Receipt | No |
| `users` | User Management | Settings | No |
| `pricing` | Pricing Config | DollarSign | No |
| `blocking` | User Blocking | Ban | No |
| `settings` | App Settings | Cog | No |
| `maintenance` | Maintenance | Wrench | No |
| `vouchers` | Vouchers | Tag | No |
| `roles` | Roles & Permissions | Shield | **Yes** |

### Layout

```
┌─────────────┬─────────────────────────────────────┐
│  Sidebar    │  Main Content Area                  │
│  (dark bg)  │                                     │
│             │  [Tab content renders here]         │
│  [Logo]     │                                     │
│  [App Name] │                                     │
│  [Role]     │                                     │
│             │                                     │
│  [Tab List] │                                     │
│             │                                     │
│  [Sign Out] │                                     │
└─────────────┴─────────────────────────────────────┘
```

- Mobile: sidebar hidden behind hamburger, slides in as overlay
- Tab selection persisted to `sessionStorage("admin_active_tab")`

---

## 3. Module: Live Operations

> Tab ID: `live` — `src/App.tsx:11786`

### Purpose
Real-time overview of platform activity: online riders on a live map, ongoing rides, and platform-wide stats.

### Stats Cards
| Card | Data Source | Query |
|------|------------|-------|
| Registered Passengers | `profiles` count where `role = 'user'` | `supabaseAdmin.from('profiles')` |
| Approved Riders | `profiles` count where `role = 'rider'` and `rider_status = 'approved'` | same |
| Online Now | Count of riders broadcasting GPS location | Realtime broadcast |

### Live Rider Map
- Supabase realtime channel: `"admin-rider-locations"` — `src/App.tsx:11514`
- Listens for `RIDER_LOCATION` broadcast events
- Updates map markers in real time
- Two states per rider:
  - **With GPS**: shown on map (green = online, amber = on trip)
  - **Online, no GPS**: listed in sidebar panel only

### Rider List Panel
Each row shows:
- Avatar, name
- Status badge: `Online` (green) / `On Trip` (amber)
- Sublabel: GPS coords or "No GPS signal"
- Tap → selects rider, centers map on them

### Ongoing Rides Panel
- Query: `rides` where `status NOT IN ('completed', 'cancelled')` — `src/App.tsx:11269`
- Each row: passenger name, rider name, pickup → dropoff, status badge
- Tap → opens ride detail modal:
  - Passenger profile
  - Rider profile
  - Fare breakdown
  - Route on map (OSRM)

### Buttons
| Button | Action |
|--------|--------|
| [Rider row] | Select rider → focus map |
| [Ongoing ride row] | Open ride detail modal |
| Refresh (auto) | Auto-refresh on tab load |

---

## 4. Module: Driver Management

> Tab ID: `drivers` — `src/App.tsx:11632`

### Purpose
View and manage all approved riders on the platform.

### Features
- Search riders by name (`driverSearch` state)
- Pagination (`driverPage`, page size 10)
- Rider cards show: avatar, name, vehicle, plate, status, rating

### Rider Card Actions
| Button | Action | API |
|--------|--------|-----|
| View Profile | Opens rider detail modal | — |
| Change Role | Dropdown: `rider → team_leader` | `updateProfile(userId, { role })` — `src/lib/supabase.ts:93` |
| Assign Team | Dropdown of all teams | `addTeamMember(teamId, riderId)` — `src/lib/teamService.ts:85` |
| Block | Opens block modal | `blockUser(userId, reason, blockedByName)` — `src/lib/supabase.ts:170` |

### Rider Detail Modal
Shows full rider profile:
- Personal info (name, phone, email)
- Vehicle info (make, model, plate, color, image)
- Documents: Driver's License, OR, CR (tappable images → lightbox)
- Rider status badge
- Verification history (reviewed_by, reviewed_at)
- Total rides, average rating

---

## 5. Module: Rider Verification

> Tab ID: `riders` — `src/App.tsx:11633`

### Purpose
Review and approve/reject new rider applications.

### Filters
| Filter | Options |
|--------|---------|
| Status | `all` / `pending` / `approved` / `rejected` |
| Search | Name or email |

### State Data (`src/App.tsx:11115`)
- `riders: Profile[]` — all rider profiles
- `selectedRider: Profile | null` — open for review
- `verifySearch`, `verifyStatusFilter`, `verifyPage` — filter state

### Rider Application Card
Shows:
- Avatar, name, email
- Submission date
- Status badge (color-coded)
- Vehicle summary
- "Review" button → opens detail panel

### Verification Detail Panel
Full-width side panel showing:
- Personal info
- Vehicle info
- Document images (Driver's License, OR/CR, Vehicle photo) — tap for lightbox
- Current status
- Previous reviewer name + date (if any)

### Verification Actions
| Button | State | Action | API |
|--------|-------|--------|-----|
| Approve | Shown always | Sets `rider_status: 'approved'` | `setRiderStatus(riderId, 'approved')` — `src/lib/supabase.ts:104` |
| Reject | Shown always | Sets `rider_status: 'rejected'` | `setRiderStatus(riderId, 'rejected')` — `src/lib/supabase.ts:104` |
| Reset to Pending | Shown for approved/rejected | Sets `rider_status: 'pending'` | `setRiderStatus(riderId, 'pending')` |

### Status Flow
```
unsubmitted → pending → approved
                     → rejected → pending (re-review)
```

---

## 6. Module: Team Management

> Tab ID: `teams` — `src/App.tsx:11634`
> Service: `src/lib/teamService.ts`

### Purpose
Create and manage rider teams. Assign team leaders. Set team capacity and schedule.

### Team Data Model (`src/lib/teamService.ts:4`)
```typescript
{
  id: string
  name: string
  capacity: number
  schedule_days: number[]   // 0=Sun, 1=Mon ... 6=Sat
  leader_id: string
  is_active: boolean
  members?: TeamMember[]
}
```

### Team List View
- Each team card: name, leader, capacity, member count, active days, status
- Tap → opens team detail / edit view

### Team Detail / Edit
- Edit team name, capacity, schedule days
- View all members with remove option
- Add member: search riders by name → select → `addTeamMember(teamId, riderId)`

### Admin Team Actions
| Button | Action | API |
|--------|--------|-----|
| Create Team | Opens create form | `supabaseAdmin.from('teams').insert(...)` |
| Edit Team | Opens edit form | `supabaseAdmin.from('teams').update(...).eq('id', teamId)` |
| Toggle Active | `is_active` toggle | same update |
| Add Member | Search + select rider | `addTeamMember(teamId, riderId)` — `src/lib/teamService.ts:85` |
| Remove Member | Remove rider from team | `removeTeamMember(teamId, riderId)` — `src/lib/teamService.ts:91` |
| Assign Leader | Change team leader | update `leader_id` |

---

## 7. Module: News Feed

> Tab ID: `news` — `src/App.tsx:11635`
> Service: `src/lib/newsService.ts`

### Purpose
Create and manage announcements visible to riders and users in the app.

### News Post Data Model
```typescript
{
  id: string
  title: string
  content: string
  category: "Announcement" | "Update" | "Promo" | "Event" | "Important"
  image_url: string | null
  published: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}
```

### Post List View
- All posts (including unpublished and archived — admin sees all)
- Filter by category
- Filter by published status
- Each card: title, category badge, date, published toggle, edit/delete buttons

### Post Create / Edit Form
| Field | Type | Required |
|-------|------|---------|
| Title | text input | Yes |
| Category | select dropdown | Yes |
| Content | textarea | Yes |
| Image | image upload → `uploadImage('avatars', userId, file)` | No |
| Published | toggle | No |

### Admin News Actions
| Button | Action | API |
|--------|--------|-----|
| Create Post | Opens create form | `supabaseAdmin.from('news_posts').insert(...)` |
| Edit | Opens edit form pre-filled | `supabaseAdmin.from('news_posts').update(...).eq('id', postId)` |
| Toggle Published | Flip `published` field | same update |
| Archive | Sets `is_archived: true` | same update |
| Delete | Confirms then deletes | `supabaseAdmin.from('news_posts').delete().eq('id', postId)` |

---

## 8. Module: Booking Analytics

> Tab ID: `analytics` — `src/App.tsx:11637`

### Purpose
Weekly booking trends and comparison stats.

### Analytics Data State (`src/App.tsx:11139`)
```typescript
{
  dayCounts: number[]       // 7 values — rides per day (Sun-Sat)
  totalThisWeek: number
  totalLastWeek: number
}
```

### Data Source
- Query: `rides` table, `status = 'completed'`, grouped by `created_at` date
- Compares this week vs last week

### Displayed Charts / Stats
| Widget | Data |
|--------|------|
| Bar chart (7-day) | `dayCounts[]` — completed rides per day |
| This Week total | `totalThisWeek` |
| Last Week total | `totalLastWeek` |
| Week-over-week delta | `(thisWeek - lastWeek) / lastWeek * 100` % |

---

## 9. Module: Revenue Dashboard

> Tab ID: `finances` — `src/App.tsx:11641`

### Purpose
Gross revenue tracking and ride-level financial records.

### Finance Data State (`src/App.tsx:11144`)
```typescript
{
  grossTotal: number        // all-time total fare
  grossThisWeek: number
  grossLastWeek: number
  recentRides: any[]        // paginated ride rows with fare info
}
```

### Summary Cards
| Card | Data |
|------|------|
| All-Time Revenue | Sum of `fare` for all completed rides |
| This Week | Sum of `fare` for this week's completed rides |
| Last Week | Sum of `fare` for last week |

### Ride Table (paginated, 20 per page)
Each row: date, passenger name, rider name, route summary, ride type, fare, booking fee, voucher discount

Tap row → opens ride receipt modal:
- Full fare breakdown
- Passenger + rider profile cards
- Optional: route map (OSRM route fetched on demand)

### Finance State
- `financePage` — current page
- `selectedFinanceRide` — ride open in detail modal
- `financeRidePassenger` — passenger profile for open ride
- `financeMapRoute` — OSRM route coords for map
- `showFinanceMap` — map modal open toggle

---

## 10. Module: Ride Reviews

> Tab ID: `reviews` — `src/App.tsx:11642`

### Purpose
Read-only view of all passenger ratings and comments for riders.

### Reviews Data State (`src/App.tsx:11129`)
```typescript
Array<{
  rider_id: string
  rating: number
  comment: string | null
  created_at: string
  profiles: { full_name: string | null; avatar_url: string | null } | null
}>
```

### Data Source
- Query: `rides` table where `rating IS NOT NULL`, joined with `profiles` for passenger info
- Ordered by `created_at DESC`

### Review Card Shows
- Rider avatar + name
- Star rating (1–5)
- Comment text (if any)
- Passenger name + avatar
- Date

### No admin actions — read-only view.

---

## 11. Module: Remittances

> Tab ID: `remittances` — `src/App.tsx:11643`
> Service: `src/lib/remittanceService.ts`

### Purpose
Review and approve/reject daily remittance submissions from riders.

### Remittance Data Model (`src/lib/remittanceService.ts:6`)
```typescript
{
  id: string
  rider_id: string
  remittance_date: string      // YYYY-MM-DD
  total_earnings: number
  total_booking_fee: number
  amount_remitted: number
  receipt_url: string | null   // GCash/bank screenshot
  status: "pending" | "approved" | "rejected"
  admin_notes: string | null
}
```

### Filters
| Filter | Options |
|--------|---------|
| Status | `all` / `pending` / `approved` / `rejected` |
| Date | date picker |

### Remittance List (paginated, 10 per page)
Each row:
- Rider name + avatar
- Date
- Amount due (booking fee)
- Amount remitted
- Status badge
- Receipt thumbnail (if uploaded)
- "Review" button

### Review Modal
Shows:
- Rider info
- Date + ride stats for that day
- Receipt image (full-size view on tap → lightbox)
- Admin notes textarea
- Action buttons

### Admin Remittance Actions
| Button | Action | API |
|--------|--------|-----|
| Approve | Sets `status: 'approved'`, saves notes | `reviewRemittance(id, 'approved', notes)` — `src/lib/remittanceService.ts:140` |
| Reject | Sets `status: 'rejected'`, saves notes | `reviewRemittance(id, 'rejected', notes)` — `src/lib/remittanceService.ts:140` |
| View Receipt | Opens lightbox with receipt image | — |

### `reviewRemittance` function (`src/lib/remittanceService.ts:140`)
```typescript
reviewRemittance(id: string, status: 'approved' | 'rejected', notes?: string): Promise<boolean>
```

---

## 12. Module: User Management

> Tab ID: `users` — `src/App.tsx:11644`
> **Super Admin only** (standard admin typically not granted this)

### Purpose
View all platform users, change roles, assign admin roles.

### User List (paginated)
- Search by name or email (`userSearch`)
- Page size selector: 10 / 25 / 50 (`userPageSize`)
- Each row: avatar, name, email, role badge, created date, actions

### User Actions
| Button | Action | API |
|--------|--------|-----|
| Change Role | Dropdown: `user / rider / team_leader / admin / super_admin` | `updateProfile(userId, { role })` — `src/lib/supabase.ts:93` |
| Assign Admin Roles | Multi-select of `adminRoles` list | `assignAdminRoles(userId, roleIds)` — `src/lib/supabase.ts:142` |
| Impersonate | Switch app to act as this user | `onImpersonate(profile)` — `src/App.tsx:11085` |
| View Detail | Opens user detail modal | — |

### User Detail Modal (`src/App.tsx:11225`)
Shows:
- Full profile info (name, email, phone, birthday, sex)
- Avatar + cover photo
- Role + admin roles
- Blocking status
- Created at
- (For riders) vehicle info, documents, rider_status

### Impersonation (`src/App.tsx:652`)
- Stored in `sessionStorage("admin_impersonating")`
- Replaces the top-level rendered component with that user's role view
- Exit impersonation → clears sessionStorage, re-renders as admin

---

## 13. Module: Pricing Config

> Tab ID: `pricing` — `src/App.tsx:11645`
> Service: `src/lib/fareService.ts`

### Purpose
Configure fare rates for each ride tier.

### PricingConfig Structure (`src/lib/fareService.ts:36`)
```typescript
{
  moto: TierConfig
  eco: TierConfig
  premium: TierConfig
}

TierConfig: {
  baseFare: number
  perKmRate: number
  perMinRate: number
  bookingFee: number
  freeKmThreshold?: number   // km before per-km rate kicks in
}
```

### Default Values
| Tier | Base | Per-km | Per-min | Booking Fee |
|------|------|--------|---------|-------------|
| Moto | ₱40 | ₱12 | ₱2 | ₱5 |
| Eco | ₱60 | ₱18 | ₱3 | ₱8 |
| Premium | ₱100 | ₱30 | ₱5 | ₱12 |

### Pricing Form
- Three sections (one per tier)
- Each field: numeric input
- Live preview: shows example fare for 5km / 12min ride

### Buttons
| Button | Action | API |
|--------|--------|-----|
| Save Pricing | Saves to Supabase + localStorage | `savePricingConfigToDB(config)` — `src/lib/fareService.ts:160` |
| Reset to Defaults | Restores DEFAULT_PRICING | `loadPricingConfig()` — `src/lib/fareService.ts:113` |

### Fare Formula
```
totalFare = baseFare
          + max(0, distanceKm - freeKmThreshold) * perKmRate
          + durationMin * perMinRate
          + bookingFee
          − voucherDiscount
```

---

## 14. Module: User Blocking

> Tab ID: `blocking` — `src/App.tsx:11646`
> Service: `src/lib/supabase.ts:159`

### Purpose
Block/unblock users and riders from using the platform.

### Blocked Profile Fields (`src/lib/supabase.ts:64`)
```typescript
{
  is_blocked: boolean
  block_reason: string | null
  blocked_by: string | null      // admin name
  blocked_at: string | null      // ISO timestamp
}
```

### Filters
| Filter | Options |
|--------|---------|
| Role | `all` / `user` / `rider` |
| Status | `all` / `blocked` / `active` |
| Search | Name or email |

### User List (paginated, 10 per page)
Each row: avatar, name, email, role, block status badge, block reason (if blocked), actions

### Block Flow
1. Admin clicks "Block" on a user
2. Modal opens with reason text input
3. Admin enters reason → confirms
4. API call: `blockUser(userId, reason, blockedByName)` — `src/lib/supabase.ts:170`
5. Blocked user immediately sees "Account suspended" screen on next app open

### Unblock Flow
1. Admin clicks "Unblock"
2. Confirmation prompt
3. API call: `unblockUser(userId)` — `src/lib/supabase.ts:190`

### Blocked User Experience
- Blocked passengers: cannot create rides, shown suspension screen
- Blocked riders: cannot go online, shown suspension screen
- Block reason displayed to blocked user

### API Functions (`src/lib/supabase.ts:159`)
```typescript
getBlockableProfiles(): Promise<Profile[]>
blockUser(targetUserId, reason, blockedByName): Promise<Profile | null>
unblockUser(targetUserId): Promise<Profile | null>
```

---

## 15. Module: App Settings

> Tab ID: `settings` — `src/App.tsx:11647`
> Service: `src/lib/settingsService.ts`

### Purpose
Configure global app appearance and feature flags.

### AppSettings Data Model (`src/lib/settingsService.ts:3`)
```typescript
{
  id: 1                          // singleton row
  app_name: string
  document_title: string
  app_logo_url: string | null
  remittance_qr_url: string | null   // GCash QR for riders to scan
  remittance_enabled: boolean
  maintenance_mode: "off" | "half" | "full"
  maintenance_message: string | null
}
```

### Settings Form Fields
| Field | Type | Effect |
|-------|------|--------|
| App Name | text | Shown in sidebar header, browser title |
| Document Title | text | `<title>` tag |
| App Logo | image upload | Logo shown in sidebar + mobile header |
| Remittance QR URL | image upload / URL | QR shown to riders in Remittance tab |
| Remittance Enabled | toggle | Enables/disables remittance feature platform-wide |

### Buttons
| Button | Action | API |
|--------|--------|-----|
| Save Settings | Updates all fields | `updateAppSettings(settings)` — `src/lib/settingsService.ts:27` |
| Upload Logo | Image picker → storage | `uploadImage('avatars', 'settings', file)` |
| Upload QR | Image picker → storage | `uploadImage('avatars', 'qr', file)` |

### API Functions (`src/lib/settingsService.ts`)
```typescript
getAppSettings(): Promise<AppSettings | null>        // :13
updateAppSettings(settings: Partial<AppSettings>): Promise<AppSettings | null>  // :27
```

---

## 16. Module: Maintenance Mode

> Tab ID: `maintenance` — `src/App.tsx:11648`
> Service: `src/lib/maintenanceService.ts`

### Purpose
Enable platform maintenance mode to restrict or halt user/rider access.

### Maintenance Modes
| Mode | Behavior |
|------|---------|
| `off` | Normal operation |
| `half` | Feature restrictions (remittances disabled); marquee banner shown; riders can still work |
| `full` | Full shutdown; all non-admin users see maintenance screen |

### MaintenanceSettings Model
```typescript
{
  maintenance_mode: "off" | "half" | "full"
  maintenance_message: string | null
}
```

### Maintenance Form
| Field | Type |
|-------|------|
| Mode | radio/select: `off` / `half` / `full` |
| Message | textarea (shown in marquee or on maintenance screen) |

### Buttons
| Button | Action |
|--------|--------|
| Save Maintenance Settings | Updates `app_settings` row + broadcasts change to all connected clients |

### User-Facing Behavior
- **`half`**: Yellow sticky marquee bar at top of app (riders see it, passengers see it)
- **`full`**: Replaces entire app UI with maintenance screen — only `admin` and `super_admin` roles can bypass

---

## 17. Module: Vouchers

> Tab ID: `vouchers` — `src/App.tsx:11649`
> Component: `VouchersTab` — `src/App.tsx:10348`
> Service: `src/lib/voucherService.ts`

### Purpose
Create, manage, and audit voucher codes for passenger discounts.

### Voucher Data Model (`src/lib/voucherService.ts:7`)
```typescript
{
  id: string
  code: string                              // normalized to uppercase
  title: string
  description: string | null
  discount_type: "percentage" | "fixed"
  discount_value: number                    // % or ₱ amount
  max_discount_amount: number | null        // cap for percentage type
  minimum_fare: number | null
  minimum_distance_km: number | null
  usage_limit: number | null                // total redemptions allowed
  per_user_limit: number                    // times one user can use it
  starts_at: string | null                  // ISO datetime
  expires_at: string | null                 // ISO datetime
  is_active: boolean
}
```

### Voucher List View
Each card shows:
- Code (monospace badge)
- Title + description
- Discount type + value
- Usage count / limit
- Validity window
- Active status toggle
- Edit / Delete buttons

### Voucher Create / Edit Form
| Field | Type | Notes |
|-------|------|-------|
| Code | text | Auto-normalized to UPPERCASE |
| Title | text | Display name |
| Description | textarea | Optional |
| Discount Type | select | `fixed` (₱) or `percentage` (%) |
| Discount Value | number | ₱ amount or % |
| Max Discount Amount | number | Cap for percentage vouchers |
| Minimum Fare | number | Min fare to apply voucher |
| Minimum Distance (km) | number | Min trip distance |
| Usage Limit | number | Total times redeemable (blank = unlimited) |
| Per-User Limit | number | Default 1 |
| Start Date | datetime | Optional |
| Expiry Date | datetime | Optional |
| Active | toggle | Default on |

### Voucher Detail View (tapping a voucher)
Shows:
- All voucher fields
- Usage history: list of rides where this voucher was used
  - Passenger name, ride date, fare, discount applied
- Buttons: Remove voucher from a specific user, mark as paid/settled

### Admin Voucher Actions
| Button | Action | API |
|--------|--------|-----|
| Create Voucher | Opens create form | `supabaseAdmin.from('vouchers').insert(...)` |
| Edit | Opens edit form | `supabaseAdmin.from('vouchers').update(...).eq('id', id)` |
| Toggle Active | Flip `is_active` | same update |
| Delete | Confirm → delete | `supabaseAdmin.from('vouchers').delete().eq('id', id)` |
| Remove from User | Remove voucher from specific user | `supabaseAdmin.from('user_vouchers').delete()...` |

### Usage Count Source
```
supabaseAdmin
  .from('user_vouchers')
  .select('voucher_id')
  .in('voucher_id', voucherIds)
```

---

## 18. Module: Roles & Permissions (Super Admin Only)

> Tab ID: `roles` — `src/App.tsx:11671`
> Functions: `src/lib/supabase.ts:112`

### Purpose
Create custom admin roles that restrict which modules a staff admin can access.

### AdminRole Data Model (`src/lib/supabase.ts:112`)
```typescript
{
  id: string
  name: string
  description: string | null
  modules: AdminTab[]   // list of tab IDs this role grants access to
  created_at: string
}
```

### Roles List View
Each role card:
- Role name + description
- Modules chips (all granted tab labels)
- Assigned admins count
- Edit / Delete buttons

### Create / Edit Role Form
| Field | Type |
|-------|------|
| Role Name | text |
| Description | textarea |
| Modules | multi-select checkboxes from `ALL_MODULES` |

### Assign Role to Admin
1. Open User Management tab
2. Find target user with `role = 'admin'`
3. Click "Assign Admin Roles" → multi-select from roles list
4. API: `assignAdminRoles(userId, roleIds)` — `src/lib/supabase.ts:142`

### Admin Role API Functions (`src/lib/supabase.ts:120`)
```typescript
getAdminRoles(): Promise<AdminRole[]>
createAdminRole(name, description, modules): Promise<AdminRole | null>
updateAdminRole(id, { name, description, modules }): Promise<AdminRole | null>
deleteAdminRole(id): Promise<boolean>
assignAdminRoles(userId, roleIds): Promise<boolean>
```

---

## 19. Data Models

### Profile (complete — `src/lib/supabase.ts:29`)
```typescript
{
  id: string                       // = auth.uid
  email: string
  full_name: string | null
  avatar_url: string | null
  cover_photo_url: string | null
  role: "user" | "rider" | "team_leader" | "admin" | "super_admin"
  onboarded: boolean
  profile_completed: boolean
  first_name: string | null
  last_name: string | null
  phone: string | null
  birthday: string | null
  sex: string | null

  // Rider-specific
  vehicle_type: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_plate: string | null
  vehicle_color: string | null
  drivers_license_url: string | null
  or_url: string | null
  cr_url: string | null
  vehicle_image_url: string | null
  rider_status: "unsubmitted" | "pending" | "approved" | "rejected"
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null

  // Admin
  admin_role_id: string | null
  admin_role_ids: string[]

  // Presence
  is_online: boolean
  last_lat: number | null
  last_lng: number | null
  last_seen_at: string | null

  // Blocking
  is_blocked: boolean
  block_reason: string | null
  blocked_by: string | null
  blocked_at: string | null

  created_at: string
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
}
```

### Remittance (`src/lib/remittanceService.ts:6`)
```typescript
{
  id: string
  rider_id: string
  remittance_date: string
  total_earnings: number
  total_booking_fee: number
  amount_remitted: number
  receipt_url: string | null
  status: "pending" | "approved" | "rejected"
  admin_notes: string | null
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

### AdminRole (`src/lib/supabase.ts:112`)
```typescript
{
  id: string
  name: string
  description: string | null
  modules: AdminTab[]
  created_at: string
}
```

### Voucher (`src/lib/voucherService.ts:7`)
```typescript
{
  id: string
  code: string
  title: string
  description: string | null
  discount_type: "percentage" | "fixed"
  discount_value: number
  max_discount_amount: number | null
  minimum_fare: number | null
  minimum_distance_km: number | null
  usage_limit: number | null
  per_user_limit: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
}
```

### Team (`src/lib/teamService.ts:4`)
```typescript
{
  id: string
  name: string
  capacity: number
  schedule_days: number[]   // 0=Sun ... 6=Sat
  leader_id: string
  is_active: boolean
  members?: TeamMember[]
}
```

---

## 20. API Reference

### Auth & Profile (`src/lib/supabase.ts`)
| Function | Line | Notes |
|----------|------|-------|
| `getProfile(userId)` | `:83` | Fetch any user profile |
| `updateProfile(userId, updates)` | `:93` | Update role, status, any field |
| `setRiderStatus(userId, status)` | `:104` | RPC: `set_rider_status` — bypasses RLS |
| `getRiderProfiles()` | `:150` | All riders ordered by created_at DESC |
| `getBlockableProfiles()` | `:161` | All users + riders |
| `blockUser(userId, reason, name)` | `:170` | Set `is_blocked: true` |
| `unblockUser(userId)` | `:190` | Clear block fields |
| `uploadImage(bucket, userId, file)` | `:206` | Buckets: `avatars`, `covers`, `documents` |

### Admin Role Management (`src/lib/supabase.ts`)
| Function | Line |
|----------|------|
| `getAdminRoles()` | `:120` |
| `createAdminRole(name, desc, modules)` | `:125` |
| `updateAdminRole(id, updates)` | `:131` |
| `deleteAdminRole(id)` | `:137` |
| `assignAdminRoles(userId, roleIds)` | `:142` — RPC: `assign_admin_roles` |

### Fare Service (`src/lib/fareService.ts`)
| Function | Line |
|----------|------|
| `DEFAULT_PRICING` | `:36` |
| `calculateFare(tier, distKm, durMin, config)` | `:82` |
| `loadPricingConfig()` | `:113` — from localStorage |
| `loadPricingConfigFromDB()` | `:136` — from Supabase |
| `savePricingConfigToDB(config)` | `:160` — admin saves |

### Remittance Service (`src/lib/remittanceService.ts`)
| Function | Line |
|----------|------|
| `getRiderRemittances(riderId)` | `:25` |
| `getRiderDailyStats(riderId, date)` | `:61` |
| `uploadReceipt(riderId, file)` | `:93` |
| `createRemittance(data)` | `:108` |
| `reviewRemittance(id, status, notes?)` | `:140` — admin approve/reject |
| `getTeamRemittances(riderIds[])` | `:162` |

### Voucher Service (`src/lib/voucherService.ts`)
| Function | Line |
|----------|------|
| `fetchVouchers()` | — all vouchers (admin) |
| `fetchUserVouchers(userId)` | `:147` |
| `addVoucherToUser(userId, code)` | `:177` |
| `markVoucherUsed(voucherId, userId)` | `:227` |
| `calculateVoucherDiscount(voucher, fare)` | `:57` |
| `getVoucherRideIssue(voucher, distKm, fare)` | `:69` |

### News Service (`src/lib/newsService.ts`)
| Function | Line | Notes |
|----------|------|-------|
| `fetchNewsPosts(includeAll?)` | `:27` | Pass `true` as admin to get unpublished + archived |

### Settings Service (`src/lib/settingsService.ts`)
| Function | Line |
|----------|------|
| `getAppSettings()` | `:13` |
| `updateAppSettings(settings)` | `:27` |

### Team Service (`src/lib/teamService.ts`)
| Function | Line |
|----------|------|
| `fetchMyTeam(leaderId)` | `:42` |
| `fetchTeamWithMembers(teamId)` | `:33` |
| `fetchRiderMembership(riderId)` | `:70` |
| `addTeamMember(teamId, riderId)` | `:85` |
| `removeTeamMember(teamId, riderId)` | `:91` |

### Supabase Direct Queries (Admin Client)
Use `supabaseAdmin` (service role key) to bypass RLS for admin operations:

```typescript
import { supabaseAdmin } from './lib/supabase'

// Example: fetch all rides regardless of RLS
const { data } = await supabaseAdmin
  .from('rides')
  .select('*')
  .order('created_at', { ascending: false })
```

### Supabase Tables Used by Admin

| Table | Admin Operations |
|-------|-----------------|
| `profiles` | read all, update role/status/blocking |
| `rides` | read all, update status |
| `remittances` | read all, update status/notes |
| `teams` | CRUD |
| `team_members` | CRUD |
| `news_posts` | CRUD |
| `vouchers` | CRUD |
| `user_vouchers` | read, delete |
| `admin_roles` | CRUD |
| `app_settings` | read, update (singleton row id=1) |

---

## React Native Integration Notes

| Web (Admin) | React Native Equivalent |
|-------------|------------------------|
| `sessionStorage` (tab persistence) | `AsyncStorage` or app state |
| Leaflet map (live ops) | `react-native-maps` + MapLibre |
| File input (uploads) | `expo-image-picker` |
| Supabase realtime broadcast | Same `@supabase/supabase-js` |
| `supabaseAdmin` (service role) | **Never expose service role key in mobile app** — route through Edge Function or secure backend |
| Image lightbox | `react-native-image-viewing` or modal with Image |
| Charts (analytics) | `react-native-chart-kit` or `Victory Native` |
| Admin-only routes | Role check on navigation: redirect non-admins |

> **Security Warning**: The `supabaseAdmin` client uses the Supabase service role key. In the web app this is an env var. In React Native, never bundle the service role key in the app binary. Instead, create Supabase Edge Functions or a backend API that performs admin operations server-side and call those from the mobile admin screens.

---

*Last updated: 2026-05-15*
