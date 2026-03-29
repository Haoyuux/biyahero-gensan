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
- `VITE_SUPABASE_URL` — Supabase project URL (client-side, prefixed with `VITE_`)
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key (client-side, prefixed with `VITE_`)

## Architecture

Single-file React app (`src/App.tsx`, ~900+ lines) with no routing or external state library. All state lives in `App.tsx` via `useState`/`useEffect`.

### View State

Top-level `view` state switches between `'app'` (rider flow) and `'admin'` (dashboard). Clicking the user avatar (top-right) opens the admin view.

### UI Flow (step state machine)

```
home → select → searching → matched
```

- **home**: Pickup/dropoff location input with Nominatim autocomplete
- **select**: Ride tier selection (Motorcycle / Economy Car / Premium Car) with dynamic pricing
- **searching**: 3.5s simulated driver search animation
- **matched**: Driver profile + in-app chat with simulated driver replies

### Admin Dashboard

Separate full-screen view (`AdminDashboard` component) with 4 tabs: Live Operations, Driver Management, Booking Analytics, Revenue Dashboard. All data is static/mocked.

### Map Layer

Always-visible Leaflet map (CartoDB tiles) with:
- Blue `DivIcon` for current device location
- Green `DivIcon` for destination
- Route polyline from OSRM

Custom `DivIcon`s are used instead of default markers to avoid broken image paths in Vite.

### External APIs

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Nominatim | `nominatim.openstreetmap.org/search` | Location autocomplete (500ms debounce, min 3 chars) |
| OSRM | `router.project-osrm.org/route/v1/driving` | Route geometry + distance/duration |

Location coordinates: Nominatim returns `[lon, lat]`; Leaflet and state use `[lat, lon]` — convert when calling OSRM.

### Pricing

Computed from `routeInfo` (distance in meters, duration in seconds) + selected ride tier:

| Tier | Base | Per-km | Per-min |
|------|------|--------|---------|
| Motorcycle (`moto`) | ₱40 | ₱10 | ₱2 |
| Economy (`eco`) | ₱60 | ₱15 | ₱3 |
| Premium (`premium`) | ₱100 | ₱25 | ₱5 |

Note: `getDynamicRides` is duplicated in both `SelectPanel` and `MatchedPanel`.

### Fallback

When geolocation is unavailable, the app defaults to Makati, Manila `[14.5547, 121.0244]`.

### Supabase Integration

`src/lib/supabase.ts` provides auth and data access:
- **Auth**: Google OAuth via `signInWithGoogle()` / `signOut()`
- **Profiles**: `getProfile()`, `updateProfile()` — reads/writes the `profiles` table
- **Rider management**: `getRiderProfiles()`, `setRiderStatus()` (calls `set_rider_status` RPC)
- **Storage**: `uploadImage(bucket, userId, file)` — buckets: `avatars`, `covers`, `documents`

User roles: `super_admin | admin | rider | user`. Rider approval states: `unsubmitted | pending | approved | rejected`.

## Tech Stack

- React 19 + TypeScript, Vite 6
- Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- Leaflet / React Leaflet for mapping
- Motion (Framer Motion fork) for animations
- `@google/genai` for AI integration
- `@supabase/supabase-js` for auth, database, and storage
- `lucide-react` for icons
- Express + dotenv (server-side)
- Path alias `@/` → project root
