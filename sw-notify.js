// Loaded into the generated service worker (see vite.config.ts → workbox.importScripts).
// - Tapping a notification brings the app to the front (or opens it).
// - "Liniște 1h" stores a mute-until time that the app reads before sending anything.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'mute') {
    event.waitUntil(
      caches.open('tura-meta').then((c) => c.put('/mute', new Response(String(Date.now() + 60 * 60 * 1000)))),
    );
    return;
  }
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          c.navigate && c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
