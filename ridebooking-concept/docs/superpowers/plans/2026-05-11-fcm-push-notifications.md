# FCM Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver FCM push notifications to all online riders when a new booking is inserted into the `rides` table — even when their browser tab is closed or phone is idle.

**Architecture:** Frontend registers with FCM on Go Online, saves token to `profiles.fcm_token`. A Supabase Edge Function triggered by a Database Webhook on `rides` INSERT fetches all online riders' FCM tokens and sends push via Firebase HTTP v1 API (JWT auth, no server process needed). Service worker handles background delivery.

**Tech Stack:** Firebase JS SDK v10 (frontend), Supabase Edge Functions (Deno runtime), Firebase HTTP v1 API with JWT-based OAuth2, Web Push API service worker.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `public/firebase-messaging-sw.js` | Create | Background service worker — receives FCM push, shows OS notification |
| `src/lib/fcmService.ts` | Create | FCM token init, save to Supabase, foreground message handler |
| `src/App.tsx` | Modify | Call `initFCM` + `saveFCMToken` when rider toggles Go Online; show in-app toast on foreground message |
| `supabase/functions/notify-new-booking/index.ts` | Create | Deno edge function — query online riders, batch send FCM via HTTP v1 API |
| `.github/workflows/main.yml` | Modify | Remove unused `firebase-service-account.json` build step |
| `.env.example` | Modify | Document new Firebase env vars |

---

### Task 1: Install Firebase SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install firebase package**

```bash
npm install firebase
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Verify install**

```bash
npm ls firebase
```

Expected: `firebase@10.x.x` listed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add firebase sdk"
```

---

### Task 2: Add fcm_token column to profiles

**Files:**
- Manual: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Run migration in Supabase SQL Editor**

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_token text;
```

Expected: success message, no error.

- [ ] **Step 2: Verify column exists**

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'fcm_token';
```

Expected: one row → `fcm_token | text`.

---

### Task 3: Create service worker

**Files:**
- Create: `public/firebase-messaging-sw.js`

Service workers run outside Vite's module system — cannot use `import.meta.env`. Firebase frontend keys are public (not secret), safe to hardcode here.

- [ ] **Step 1: Create `public/firebase-messaging-sw.js`**

```javascript
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBKM_JifwVUUWs9sGwhtsKv3NZUGFbBdqI',
  authDomain: 'biyahero-89e8f.firebaseapp.com',
  projectId: 'biyahero-89e8f',
  messagingSenderId: '683688974446',
  appId: '1:683688974446:web:7113eed80bec51fd64ee7f',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'New Booking!', {
    body: body ?? 'A new booking is available near you.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'new-booking',
    renotify: true,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
```

- [ ] **Step 2: Verify file accessible in dev**

Start dev server (`npm run dev`), open:
`http://localhost:3000/firebase-messaging-sw.js`

Expected: file contents visible, no 404.

- [ ] **Step 3: Commit**

```bash
git add public/firebase-messaging-sw.js
git commit -m "feat: add firebase messaging service worker"
```

---

### Task 4: Create fcmService.ts

**Files:**
- Create: `src/lib/fcmService.ts`

- [ ] **Step 1: Create `src/lib/fcmService.ts`**

```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { supabase } from './supabase';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export async function initFCM(): Promise<string | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  return token ?? null;
}

export async function saveFCMToken(userId: string, token: string): Promise<void> {
  await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId);
}

export function onForegroundMessage(callback: (payload: MessagePayload) => void): () => void {
  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}
```

- [ ] **Step 2: Run type-check**

```bash
npm run lint
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fcmService.ts
git commit -m "feat: add FCM service for token registration and foreground messages"
```

---

### Task 5: Hook FCM into Go Online toggle in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import to App.tsx**

App.tsx uses `@/src/lib/` prefix for lib imports (see line 106–141). Add after the existing lib imports (around line 141):

```tsx
import { initFCM, saveFCMToken, onForegroundMessage } from '@/src/lib/fcmService';
```

- [ ] **Step 2: Replace Go Online toggle handler**

Find this exact line around line 7245 in `src/App.tsx`:
```tsx
                          setIsOnline((prev) => !prev);
```

Replace with:
```tsx
                          const newOnline = !isOnline;
                          setIsOnline(newOnline);
                          if (newOnline && currentProfile?.id) {
                            initFCM()
                              .then((token) => { if (token) saveFCMToken(currentProfile.id, token); })
                              .catch(console.error);
                          }
```

- [ ] **Step 3: Add foreground notification useEffect**

Find the `isOnline` useState declaration around line 5630:
```tsx
  const [isOnline, setIsOnline] = useState(false);
```

Add this useEffect immediately after it:
```tsx
  useEffect(() => {
    if (!isOnline) return;
    return onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? 'New Booking!';
      const body = payload.notification?.body ?? 'A new booking is available near you.';
      showRiderNotification(`${title} — ${body}`);
    });
  }, [isOnline]);
```

- [ ] **Step 4: Run type-check**

```bash
npm run lint
```

Expected: no TypeScript errors.

- [ ] **Step 5: Manual test — Go Online permission prompt**

1. `npm run dev`
2. Log in as a rider
3. Click **Go Online**
4. Browser shows notification permission prompt — click Allow
5. DevTools → Application → Service Workers → verify `firebase-messaging-sw.js` is registered and active

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: register FCM token when rider goes online"
```

---

### Task 6: Create Supabase Edge Function

**Files:**
- Create: `supabase/functions/notify-new-booking/index.ts`

Uses Deno's built-in `crypto.subtle` for JWT signing — no external JWT library needed. Calls Firebase HTTP v1 API directly.

- [ ] **Step 1: Create directory**

```bash
mkdir -p supabase/functions/notify-new-booking
```

- [ ] **Step 2: Create `supabase/functions/notify-new-booking/index.ts`**

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`;

  const pemKey = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

async function sendFCM(token: string, accessToken: string, projectId: string): Promise<void> {
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: 'New Booking!',
            body: 'A new booking is available near you. Tap to open.',
          },
        },
      }),
    },
  );
}

Deno.serve(async (_req) => {
  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as Record<string, string>;
    const projectId = serviceAccount.project_id;

    const { data: riders } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('is_online', true)
      .eq('role', 'rider')
      .not('fcm_token', 'is', null);

    if (!riders?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const accessToken = await getAccessToken(serviceAccount);

    await Promise.all(
      riders.map(({ fcm_token }: { fcm_token: string }) =>
        sendFCM(fcm_token, accessToken, projectId)
      ),
    );

    return new Response(JSON.stringify({ sent: riders.length }), { status: 200 });
  } catch (err) {
    console.error('notify-new-booking error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-new-booking/index.ts
git commit -m "feat: add edge function to broadcast FCM notifications on new booking"
```

---

### Task 7: Deploy edge function and configure Supabase

- [ ] **Step 1: Install Supabase CLI (if not installed)**

```bash
npm install -g supabase
```

- [ ] **Step 2: Login and link project**

```bash
supabase login
supabase link --project-ref fnxhdsxslbkggtjnaxoj
```

Expected: `Linked to project biyahero-89e8f`

- [ ] **Step 3: Deploy edge function**

```bash
supabase functions deploy notify-new-booking
```

Expected: `Deployed Function notify-new-booking`

- [ ] **Step 4: Add Firebase service account as Supabase secret**

Replace `{...}` with your minified service account JSON:

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"biyahero-89e8f","private_key_id":"c512c3b163c04dbaa3ee71205ffbe162ebf849e1","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEv...-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@biyahero-89e8f.iam.gserviceaccount.com","client_id":"118033207393950006952","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40biyahero-89e8f.iam.gserviceaccount.com","universe_domain":"googleapis.com"}'
```

Expected: `Finished supabase secrets set`

- [ ] **Step 5: Configure Database Webhook in Supabase Dashboard**

1. Go to **Supabase Dashboard → Database → Webhooks**
2. Click **Create a new hook**
3. Fill in:
   - Name: `notify-new-booking`
   - Table: `rides`
   - Events: check **Insert** only
   - Type: **HTTP Request**
   - URL: `https://fnxhdsxslbkggtjnaxoj.supabase.co/functions/v1/notify-new-booking`
   - HTTP Headers: add `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueGhkc3hzbGJrZ2d0am5heG9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDcxNzksImV4cCI6MjA5MDIyMzE3OX0.frj612MFXRu8AKt9QaEk5leeoWf-c-r3m_hDLDoyYVc`
4. Click **Create webhook**

- [ ] **Step 6: Test edge function manually**

```bash
curl -X POST https://fnxhdsxslbkggtjnaxoj.supabase.co/functions/v1/notify-new-booking \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueGhkc3hzbGJrZ2d0am5heG9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDcxNzksImV4cCI6MjA5MDIyMzE3OX0.frj612MFXRu8AKt9QaEk5leeoWf-c-r3m_hDLDoyYVc" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"sent":0}` (no online riders yet) or `{"sent":N}` if riders are online.

---

### Task 8: Clean up GitHub workflow

**Files:**
- Modify: `.github/workflows/main.yml`

The `firebase-service-account.json` step added earlier is unused — Docker image is nginx-only static build. Remove it.

- [ ] **Step 1: Remove the step from `.github/workflows/main.yml`**

Find and remove this block:
```yaml
      - name: Create Firebase service account file
        run: echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT_KEY }}' > firebase-service-account.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/main.yml
git commit -m "chore: remove unused firebase service account step from workflow"
```

---

### Task 9: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Firebase keys to `.env.example`**

Append to the file:
```
# Firebase Cloud Messaging — get from Firebase Console → Project Settings
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key
# FIREBASE_SERVICE_ACCOUNT: set via `supabase secrets set`, never in this file
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add firebase fcm env vars to .env.example"
```

---

### Task 10: End-to-end test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Log in as rider, go online**

Click **Go Online**. Browser shows notification permission prompt. Click Allow.
Check DevTools → Application → Service Workers → `firebase-messaging-sw.js` registered and active.
Check DevTools → Application → Storage → IndexedDB — FCM token stored by Firebase SDK.

- [ ] **Step 3: Verify FCM token saved to Supabase**

In Supabase Dashboard → Table Editor → `profiles` → find rider row.
Expected: `fcm_token` column populated with a long string.

- [ ] **Step 4: Book a ride as a user**

In another browser tab / incognito, log in as a regular user and book a ride.
This triggers INSERT into `rides` → Supabase webhook → Edge Function.

- [ ] **Step 5: Verify notification received**

On rider's device/tab:
- If tab is **in background**: OS notification appears — "New Booking! A new booking is available near you. Tap to open."
- If tab is **in foreground**: `showRiderNotification` toast appears in-app.

- [ ] **Step 6: Check Edge Function logs**

Supabase Dashboard → Edge Functions → `notify-new-booking` → Logs.
Expected: `{"sent":1}` (or N for number of online riders).
