// No caching of authenticated pages or APIs. Updates use the network as usual.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification('Dediko ♡', {
    body: payload.body || 'შენი პატარა გეგმის დროა. გახსენი Dediko.',
    icon: '/assets/app-icon-192.png', badge: '/assets/app-icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : 'dediko-reminder',
    data: { url: '/?page=reminders' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    const target = new URL('/?page=reminders', self.location.origin).href;
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  })());
});
