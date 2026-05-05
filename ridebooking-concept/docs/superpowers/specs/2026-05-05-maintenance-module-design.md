# Maintenance Module — Design Spec
**Date:** 2026-05-05
**Project:** fetch-gensan / ridebooking-concept

---

## Overview

A maintenance module that lets admins put the app into full or partial maintenance mode, with optional scheduling, an optional auto-posted news announcement, and a real-time marquee banner for half-maintenance.

---

## Modes

| Mode | Description |
|------|-------------|
| `off` | Normal operation |
| `half` | Partial restrictions for users and riders; marquee banner shown |
| `full` | Non-admin users see a full-screen maintenance page on login |

---

## Database

### New table: `maintenance` (singleton, id = 1)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | int | no | always 1 |
| `mode` | text | no | `'off'`, `'half'`, `'full'` |
| `message` | text | yes | displayed on full-screen and in marquee |
| `scheduled_start` | timestamptz | yes | null = activate immediately on save |
| `scheduled_end` | timestamptz | yes | null = no automatic lift |
| `post_news` | boolean | no | default false; admin opts in to auto-post |
| `auto_news_post_id` | uuid | yes | tracks created news post for update/delete |
| `updated_at` | timestamptz | no | |

**Effective mode logic (client-side):**
```
now = current time
if mode == 'off' → effective = 'off'
else if scheduled_start != null && now < scheduled_start → effective = 'off'
else if scheduled_end != null && now >= scheduled_end → effective = 'off'
else → effective = mode
```
No server cron required — clients compute effective mode on each check.

---

## New Service: `src/lib/maintenanceService.ts`

```ts
export type MaintenanceMode = 'off' | 'half' | 'full';

export interface MaintenanceSettings {
  id: number;
  mode: MaintenanceMode;
  message: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  post_news: boolean;
  auto_news_post_id: string | null;
  updated_at: string;
}

getMaintenanceSettings(): Promise<MaintenanceSettings | null>
updateMaintenanceSettings(settings: Partial<MaintenanceSettings>): Promise<boolean>
subscribeToMaintenance(cb: (s: MaintenanceSettings) => void): () => void
getEffectiveMode(s: MaintenanceSettings): MaintenanceMode
```

- `getMaintenanceSettings` uses anon `supabase` client (public read)
- `updateMaintenanceSettings` uses `supabaseAdmin` (bypasses RLS)
- `subscribeToMaintenance` uses Supabase Realtime `postgres_changes` on the `maintenance` table — pushes updates to all connected clients instantly
- `getEffectiveMode` implements the client-side effective-mode logic above

---

## Auto News Post Behavior

When admin saves with `post_news = true`:
- **Mode = `full`**: Create (or update) a news post:
  - Title: `"System Maintenance"`
  - Category: `Important`
  - Body: admin's message + scheduled window formatted as human-readable date/time
  - `published = true`
  - Store returned post id in `auto_news_post_id`
- **Mode = `half`**: Same, title `"Partial Maintenance"`
- **Mode = `off`**: If `auto_news_post_id` exists, archive the post (`is_archived = true`); clear `auto_news_post_id`
- If admin saves again with updated schedule and `auto_news_post_id` is set, **update** the existing post rather than creating a duplicate

---

## App.tsx Integration

### On load (after auth)
1. Call `getMaintenanceSettings()`
2. Store in top-level state: `maintenanceSettings`
3. Subscribe to Realtime — update `maintenanceSettings` on change
4. Derive `effectiveMode = getEffectiveMode(maintenanceSettings)`

### Full maintenance gate
```
if effectiveMode == 'full' && role not in ['admin', 'super_admin']:
  render <MaintenanceScreen> instead of dashboard
```

### Half maintenance: prop drilling
Pass `effectiveMode` to `UserApp` and `RiderDashboard`.

**UserApp restrictions (half):**
- Book button disabled (greyed out with tooltip "Unavailable during maintenance")
- History tab: accessible ✅
- News tab: accessible ✅
- Profile image upload: accessible ✅

**RiderDashboard restrictions (half):**
- Go-online toggle disabled
- Remittances tab hidden
- History tab: accessible ✅
- News tab: accessible ✅
- Profile image upload: accessible ✅

---

## MaintenanceScreen Component

Full-page screen shown to non-admin users during full maintenance.

**Elements:**
- App logo (from `app_settings.app_logo_url`)
- Wrench/tool icon
- Heading: `"We'll be right back"`
- Body: `maintenanceSettings.message` (or default: `"The system is currently under maintenance."`)
- If `scheduled_end` is set: `"Expected back: [formatted date/time]"`
- Subtle animated background (pulse or shimmer)

---

## MaintenanceBanner Component (Marquee)

Sticky bar at the very top of the screen. Shown to non-admin users when `effectiveMode == 'half'`.

**Text logic:**
- If `scheduled_end` set: `"System maintenance in progress — expected back [formatted date/time]"`
- If no end time: `"System is under partial maintenance. Some features are temporarily unavailable."`
- If `scheduled_start` is in the future (not yet active but mode is half/full and saved): `"Scheduled maintenance on [scheduled_start formatted]"`

**Style:** amber/yellow background, dark text, scrolling marquee animation, fixed position, z-index above all content.

---

## Admin UI — Maintenance Tab

New tab in `AdminDashboard` (visible to `admin` and `super_admin` only), added between "App Settings" and other tabs.

### Fields

| Field | Control | Notes |
|-------|---------|-------|
| Mode | 3-way toggle: Off / Half / Full | |
| Activate immediately | Checkbox | When checked, hides start date picker |
| Scheduled start | Date + time picker | Hidden when "activate immediately" checked |
| Scheduled end | Date + time picker | Optional |
| Message | Textarea | Placeholder: "We are performing scheduled maintenance..." |
| Post announcement | Checkbox | Visible when mode ≠ off |

### Save behavior
1. Validate: if not immediate, `scheduled_start` must be set
2. If `post_news` and mode ≠ `off`: create/update news post via `newsService`
3. If mode = `off` and `auto_news_post_id` set: archive news post
4. Upsert `maintenance` table row via `updateMaintenanceSettings`
5. Show success toast

### Status indicator
Below the form, show current effective status:
- Green dot: `"Maintenance is OFF"`
- Amber dot: `"Half maintenance active"` or `"Half maintenance scheduled for [date]"`
- Red dot: `"Full maintenance active"` or `"Full maintenance scheduled for [date]"`

---

## Realtime Propagation

All connected clients receive Supabase Realtime `postgres_changes` events on the `maintenance` table. On receive:
- Update `maintenanceSettings` state
- Re-derive `effectiveMode`
- If a user was mid-booking when half → full kicks in: the MaintenanceScreen renders on top, booking state preserved in localStorage for when maintenance lifts

---

## Scheduled Auto-Lift

Since effective mode is computed client-side from timestamps, the app checks on:
1. App load
2. Every Realtime update
3. A `setInterval` every 60 seconds — re-derives `effectiveMode` so the transition happens automatically without a server push

---

## Roles Summary

| Role | Full maintenance | Half maintenance |
|------|-----------------|-----------------|
| `user` | Sees MaintenanceScreen | Booking disabled; history/news/profile ✅ |
| `rider` | Sees MaintenanceScreen | Go-online disabled, remit hidden; history/news/profile ✅ |
| `team_leader` | Sees MaintenanceScreen | Same as rider |
| `admin` | Full access | Full access |
| `super_admin` | Full access | Full access |

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/lib/maintenanceService.ts` | New — all maintenance DB/Realtime logic |
| `src/App.tsx` | Load settings, subscribe Realtime, gate full-maintenance, pass mode prop |
| `src/App.tsx` (MaintenanceScreen) | New component inline |
| `src/App.tsx` (MaintenanceBanner) | New component inline |
| `src/App.tsx` (MaintenanceTab admin) | New tab component inline |
| Supabase | New `maintenance` table (manual migration) |
