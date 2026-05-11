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
