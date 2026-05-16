# Notification Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a notification sound (with banner) when a rider receives a booking request and when a passenger's booking is accepted — in both foreground and background.

**Architecture:** Use `expo-notifications` local notifications (already installed). A `setNotificationHandler` registered at navigator level enables banners + sound when the app is foregrounded. Each broadcast event handler schedules an instant local notification (`trigger: null`) so the OS plays sound regardless of app state.

**Tech Stack:** `expo-notifications ~0.32.17`, React Native, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/navigation/RiderNavigator.tsx` | Add module-level `Notifications.setNotificationHandler` |
| `src/navigation/UserNavigator.tsx` | Add module-level `Notifications.setNotificationHandler` |
| `src/screens/rider/RiderHomeScreen.tsx` | Schedule local notification inside `REQUEST_RIDE` handler |
| `src/screens/user/HomeScreen.tsx` | Create `ride-status` Android channel on mount + schedule notification in `RIDE_ACCEPTED` handler |

---

### Task 1: Enable foreground notifications in RiderNavigator

**Files:**
- Modify: `src/navigation/RiderNavigator.tsx`

- [ ] **Step 1: Add the import and setNotificationHandler**

Open `src/navigation/RiderNavigator.tsx`. Add the import at the top and the handler call at module level (outside the component function, right after the imports):

```ts
import * as Notifications from 'expo-notifications';
```

After all imports, before `const Tab = createBottomTabNavigator();`, add:

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx expo start` and confirm no TypeScript errors in the terminal output for this file.

- [ ] **Step 3: Commit**

```bash
git add src/navigation/RiderNavigator.tsx
git commit -m "feat: enable foreground notification sound in RiderNavigator"
```

---

### Task 2: Enable foreground notifications in UserNavigator

**Files:**
- Modify: `src/navigation/UserNavigator.tsx`

- [ ] **Step 1: Add the import and setNotificationHandler**

Open `src/navigation/UserNavigator.tsx`. Add the import at the top:

```ts
import * as Notifications from 'expo-notifications';
```

After all imports, before `const Tab = createBottomTabNavigator();`, add:

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx expo start` and confirm no TypeScript errors in the terminal output for this file.

- [ ] **Step 3: Commit**

```bash
git add src/navigation/UserNavigator.tsx
git commit -m "feat: enable foreground notification sound in UserNavigator"
```

---

### Task 3: Play sound when rider receives a booking request

**Files:**
- Modify: `src/screens/rider/RiderHomeScreen.tsx`

- [ ] **Step 1: Schedule a local notification inside the REQUEST_RIDE handler**

In `src/screens/rider/RiderHomeScreen.tsx`, find the `REQUEST_RIDE` handler (around line 286):

```ts
ch.on('broadcast', { event: 'REQUEST_RIDE' }, ({ payload }) => {
  const declinedAt = declinedRidesRef.current.get(payload.rideId);
  if (declinedAt && Date.now() - declinedAt < 60000) return;
  setRequestQueue(prev => {
    if (prev.some((r: any) => r.rideId === payload.rideId)) return prev;
    return [...prev, payload];
  });
});
```

Replace it with:

```ts
ch.on('broadcast', { event: 'REQUEST_RIDE' }, ({ payload }) => {
  const declinedAt = declinedRidesRef.current.get(payload.rideId);
  if (declinedAt && Date.now() - declinedAt < 60000) return;
  setRequestQueue(prev => {
    if (prev.some((r: any) => r.rideId === payload.rideId)) return prev;
    return [...prev, payload];
  });
  const passengerName = [payload.user?.first_name, payload.user?.last_name].filter(Boolean).join(' ') || 'Passenger';
  Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Ride Request',
      body: `₱${payload.fare} · ${passengerName}`,
      sound: true,
      channelId: 'ride-requests',
    },
    trigger: null,
  });
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx expo start` — confirm no TypeScript errors. The `Notifications` import already exists at the top of this file (line 12), so no new import is needed.

- [ ] **Step 3: Manual test**

  1. Build/run the app on a physical Android device (local notifications work in Expo Go too).
  2. Log in as a rider and go online.
  3. From a separate device/session, book a ride as a passenger.
  4. **Foreground test:** Keep the rider app on screen — confirm a notification banner appears and sound plays.
  5. **Background test:** Press the home button on the rider device (app minimized) — confirm the notification banner and sound appear in the status bar.

- [ ] **Step 4: Commit**

```bash
git add src/screens/rider/RiderHomeScreen.tsx
git commit -m "feat: play notification sound when rider receives booking request"
```

---

### Task 4: Play sound when passenger's booking is accepted

**Files:**
- Modify: `src/screens/user/HomeScreen.tsx`

- [ ] **Step 1: Add the Notifications import**

Open `src/screens/user/HomeScreen.tsx`. Add to the existing imports at the top:

```ts
import * as Notifications from 'expo-notifications';
```

Note: `Platform` is already imported from `react-native` in this file — do not add it again.

- [ ] **Step 2: Create the ride-status Android notification channel on mount**

Find the `// Init` `useEffect` (around line 202):

```ts
// Init
useEffect(() => {
  loadPricingConfigFromDB(supabase).then(setPricingConfig);
  AsyncStorage.getItem(FAVORITES_KEY).then(val => {
```

Add the channel creation at the very start of that `useEffect` callback, before the existing lines:

```ts
// Init
useEffect(() => {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('ride-status', {
      name: 'Ride Status',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
  loadPricingConfigFromDB(supabase).then(setPricingConfig);
  AsyncStorage.getItem(FAVORITES_KEY).then(val => {
```

- [ ] **Step 3: Schedule a local notification inside the RIDE_ACCEPTED handler**

Find the `RIDE_ACCEPTED` handler (around line 403):

```ts
ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  stopBroadcasting();
  const rider = payload.rider as Profile;
  setActiveRider(rider);
  const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
  setFareBreakdown(bd);
  setStep('matched');
  saveRideState({ step: 'matched', activeRider: rider });
  if (rider.last_lat && rider.last_lng) {
    mapRef.current?.setRiderLocation(rider.last_lat, rider.last_lng);
    setLastRiderCoords({ lat: rider.last_lat, lng: rider.last_lng });
    lastRiderCoordsRef.current = { lat: rider.last_lat, lng: rider.last_lng };
    mapRef.current?.flyTo(rider.last_lat, rider.last_lng, 15);
    drawRiderToPickupRoute(rider.last_lat, rider.last_lng);
  }
  showToast('Rider found! On the way...', 'success');
});
```

Replace it with:

```ts
ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
  if (payload.rideId !== currentRideId) return;
  stopBroadcasting();
  const rider = payload.rider as Profile;
  setActiveRider(rider);
  const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
  setFareBreakdown(bd);
  setStep('matched');
  saveRideState({ step: 'matched', activeRider: rider });
  if (rider.last_lat && rider.last_lng) {
    mapRef.current?.setRiderLocation(rider.last_lat, rider.last_lng);
    setLastRiderCoords({ lat: rider.last_lat, lng: rider.last_lng });
    lastRiderCoordsRef.current = { lat: rider.last_lat, lng: rider.last_lng };
    mapRef.current?.flyTo(rider.last_lat, rider.last_lng, 15);
    drawRiderToPickupRoute(rider.last_lat, rider.last_lng);
  }
  showToast('Rider found! On the way...', 'success');
  const riderName = [rider.first_name, rider.last_name].filter(Boolean).join(' ') || 'Your rider';
  Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rider Found!',
      body: `${riderName} is on the way`,
      sound: true,
      channelId: 'ride-status',
    },
    trigger: null,
  });
});
```

- [ ] **Step 4: Verify it compiles**

Run: `npx expo start` — confirm no TypeScript errors.

- [ ] **Step 5: Manual test**

  1. Log in as a passenger and book a ride.
  2. On a separate device, log in as a rider and accept the booking.
  3. **Foreground test:** Keep the passenger app on screen — confirm notification banner + sound plays.
  4. **Background test:** Press home on the passenger device (app minimized) before the rider accepts — confirm the notification banner and sound appear.

- [ ] **Step 6: Commit**

```bash
git add src/screens/user/HomeScreen.tsx
git commit -m "feat: play notification sound when passenger booking is accepted"
```
