// ─── Notification Service ─────────────────────────────────────────────────────
// Wraps the browser Notification API. Shows native OS notifications when the
// tab is open but not focused. Fails silently if permission is denied.

/** Request permission once on app load. Call from a user-gesture context. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Show a native push notification. No-ops if permission not granted. */
export function pushNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
  } catch { /* blocked programmatically in some browsers */ }
}
