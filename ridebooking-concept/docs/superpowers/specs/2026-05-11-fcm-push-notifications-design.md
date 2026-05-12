# FCM Push Notifications Design

**Date:** 2026-05-11
**Status:** Approved

## Problem

Riders go home after going online. When a new booking arrives, they need to be notified on their phone with sound — even when the browser tab is closed or the phone screen is off.

The app is a pure static frontend (nginx/Docker). No Express server runs in production, so notifications must be triggered via a serverless backend.

## Solution Overview

Firebase Cloud Messaging (FCM) for push delivery + Supabase Edge Function as the serverless trigger.

```
User books ride
  → INSERT into rides table
  → Supabase DB Webhook
  → Edge Function: notify-new-booking
  → Query profiles WHERE is_online=true AND role='rider' AND fcm_token IS NOT NULL
  → Firebase HTTP v1 API (batch send)
  → FCM delivers push to all online rider devices
  → Service worker shows OS notification + sound
```

## Architecture

### Constraint

No Node.js server in production. Dockerfile builds static dist served by nginx. All server-side logic must run in Supabase Edge Functions (Deno runtime).

## Components

### 1. Database — profiles table

Add `fcm_token text` column to `profiles` table.

```sql
ALTER TABLE profiles ADD COLUMN fcm_token text;
```

Riders' FCM tokens stored here. Updated by frontend whenever token refreshes. Null means rider has not granted notification permission.

### 2. Frontend — fcmService.ts

New file: `src/lib/fcmService.ts`

Functions:
- `initFCM()` — initializes Firebase app, registers service worker, returns FCM token
- `saveFCMToken(userId, token)` — upserts token into `profiles.fcm_token`
- `onForegroundMessage(cb)` — listens for notifications when app tab is in foreground

Called from `RiderDashboard` when rider taps **Go Online**. Uses a user-gesture context so the browser permission prompt is allowed.

Token auto-refreshes via FCM SDK `onTokenRefresh` listener — saves updated token to Supabase on change.

### 3. Frontend — Service Worker

New file: `public/firebase-messaging-sw.js`

Runs in background independent of the browser tab. Handles `push` events from FCM and shows an OS-level notification with:
- Title: "New Booking!"
- Body: "A new booking is available near you."
- Icon: `/favicon.ico`
- Sound: browser default notification sound (OS-controlled)
- Click action: opens/focuses the app tab

### 4. Supabase Edge Function

New file: `supabase/functions/notify-new-booking/index.ts`

Triggered by a Supabase Database Webhook on `INSERT` to the `rides` table.

Steps:
1. Parse webhook payload
2. Query `profiles` for all `is_online=true`, `role='rider'`, `fcm_token IS NOT NULL`
3. Authenticate with Firebase using service account (OAuth2 access token via JWT)
4. POST to Firebase HTTP v1 API: `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`
5. Batch send one notification per token (FCM v1 API sends one at a time; parallelise with `Promise.all`)

### 5. Supabase Webhook

Configured in Supabase Dashboard:
- Table: `rides`
- Event: `INSERT`
- Target: Edge Function `notify-new-booking`

### 6. Supabase Secret

Service account JSON stored as Supabase secret:
```
supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

Never exposed to frontend. Only accessible inside edge function.

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_FIREBASE_API_KEY` | Frontend (.env) | Firebase app init |
| `VITE_FIREBASE_AUTH_DOMAIN` | Frontend (.env) | Firebase app init |
| `VITE_FIREBASE_PROJECT_ID` | Frontend (.env) | Firebase app init |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Frontend (.env) | Firebase app init |
| `VITE_FIREBASE_APP_ID` | Frontend (.env) | Firebase app init |
| `VITE_FIREBASE_VAPID_KEY` | Frontend (.env) | Service worker push subscription |
| `FIREBASE_SERVICE_ACCOUNT` | Supabase secret | Edge function sends FCM |

## Data Flow — Token Lifecycle

1. Rider opens app → `RiderDashboard` mounts
2. Rider taps "Go Online" → `initFCM()` called
3. Browser shows permission prompt
4. If granted → FCM token returned → `saveFCMToken()` saves to `profiles`
5. Token refreshes → `onTokenRefresh` fires → saves new token
6. Rider goes offline / uninstalls → token becomes stale (FCM returns error, edge function ignores invalid tokens)

## Notification Behaviour

| Scenario | Result |
|----------|--------|
| Tab open, app visible | `onForegroundMessage` fires, can show in-app toast |
| Tab open, minimized | Service worker shows OS notification |
| Tab closed, browser open | Service worker shows OS notification |
| Browser fully closed (Android Chrome) | OS notification delivered |
| iOS Safari (not PWA) | No background push — limitation of iOS WebKit |
| iOS Safari (installed as PWA) | Push works |

## Error Handling

- FCM token not available (permission denied): skip silently, rider gets no push
- Invalid/expired FCM token: Firebase returns `UNREGISTERED` error, edge function ignores and continues
- Edge function failure: Supabase logs error, booking still saved — notification is best-effort

## Out of Scope

- Targeting a specific rider (current design broadcasts to all online riders)
- Notification history / inbox
- iOS PWA installation prompt
