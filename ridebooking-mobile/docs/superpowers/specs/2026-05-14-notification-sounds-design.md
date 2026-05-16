# Notification Sounds Design
**Date:** 2026-05-14

## Goal
Play a notification sound (with banner) when:
1. A rider receives a new booking request
2. A passenger's booking is accepted by a rider

Sounds must fire in both foreground (app open) and background (app minimized).

## Approach
Use `expo-notifications` local notifications — already installed (`~0.32.17`). No new packages required. The OS handles sound playback natively via Android notification channels and iOS default sound.

## Components

### 1. Foreground notification handler (both navigators)
Add `Notifications.setNotificationHandler` once at the top of `RiderNavigator.tsx` and `UserNavigator.tsx` (outside component, module-level). This enables banners + sound when app is in foreground.

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

### 2. Rider — booking request sound (`RiderHomeScreen.tsx`)
- **Trigger:** Inside the `REQUEST_RIDE` broadcast handler, after the request is added to the queue
- **Channel:** Existing `ride-requests` Android channel (already has `sound: 'default'`, `importance: MAX`)
- **Notification:**
  - Title: `"New Ride Request"`
  - Body: `"₱{fare} · {passengerFirstName} {passengerLastName}"`

### 3. Passenger — ride accepted sound (`HomeScreen.tsx`)
- **Trigger:** Inside the `RIDE_ACCEPTED` broadcast handler, after `setStep('matched')`
- **Channel:** New `ride-status` Android channel — created once on component mount (same pattern as rider's channel setup)
- **Channel config:** `importance: MAX`, `sound: 'default'`, `vibrationPattern: [0, 250, 250, 250]`
- **Notification:**
  - Title: `"Rider Found!"`
  - Body: `"{riderFirstName} {riderLastName} is on the way"`

## Android channel summary
| Channel ID     | Used by   | Created in         |
|----------------|-----------|--------------------|
| `ride-requests`| Rider     | `RiderHomeScreen` (already exists) |
| `ride-status`  | Passenger | `HomeScreen` (new) |

## iOS
No channel setup needed. `shouldPlaySound: true` in the handler is sufficient. iOS uses the default system sound.

## Limitations
- If the app is fully killed/closed, Supabase Realtime won't fire, so no sound will play. This is a Realtime constraint, not a notifications constraint.
- Expo Go blocks remote push tokens but **local notifications work fine** in Expo Go for testing.

## Files changed
1. `src/navigation/RiderNavigator.tsx` — add `setNotificationHandler`
2. `src/navigation/UserNavigator.tsx` — add `setNotificationHandler`
3. `src/screens/rider/RiderHomeScreen.tsx` — schedule notification on `REQUEST_RIDE`
4. `src/screens/user/HomeScreen.tsx` — create `ride-status` channel + schedule notification on `RIDE_ACCEPTED`
