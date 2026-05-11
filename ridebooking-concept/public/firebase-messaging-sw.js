// Uses native Web Push API — avoids Firebase compat CDN which can fail silently on mobile Chrome.
// Firebase HTTP v1 API sends standard Web Push messages handled by native push events.

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {};
  }

  const notification = payload.notification ?? {};
  const title = notification.title ?? 'New Booking!';
  const body = notification.body ?? 'A new booking is available near you.';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'new-booking',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', function (event) {
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
