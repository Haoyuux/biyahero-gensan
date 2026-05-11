import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, deleteToken, MessagePayload } from 'firebase/messaging';
import { supabase, supabaseAdmin } from './supabase';

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
  const { error } = await supabaseAdmin.from('profiles').update({ fcm_token: token }).eq('id', userId);
  if (error) throw error;
}

export function onForegroundMessage(callback: (payload: MessagePayload) => void): () => void {
  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}

export async function clearFCMToken(userId: string): Promise<void> {
  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  try {
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (registration) {
      await deleteToken(messaging);
    }
  } catch {
    // ignore — token may already be expired
  }
  localStorage.removeItem('fetch_fcm_token');
  await supabaseAdmin.from('profiles').update({ fcm_token: null }).eq('id', userId);
}
