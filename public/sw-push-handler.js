/* Service Worker Push & Notification Click Handler for ЭТАЛОН ПРАВИЛО */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Новое бронирование · ЭТАЛОН ПРАВИЛО',
      body: event.data ? event.data.text() : 'Поступила новая запись в студию.',
    };
  }

  const title = payload.title || 'Новое бронирование · ЭТАЛОН ПРАВИЛО';
  const options = {
    body: payload.body || 'Откройте расписание, чтобы посмотреть детали записи.',
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'etalon-booking-alert',
    renotify: true,
    requireInteraction: false,
    data: {
      url: payload.url || '/',
      bookingId: payload.bookingId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SHOW_BOOKING_NOTIFICATION') return;

  const title = data.title || 'Новое бронирование · ЭТАЛОН ПРАВИЛО';
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'etalon-booking-alert',
    renotify: true,
    data: {
      url: data.url || '/',
      bookingId: data.bookingId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              bookingId: notifData.bookingId || null,
              url: targetUrl,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
