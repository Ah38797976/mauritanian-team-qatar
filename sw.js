// Service Worker للإشعارات فقط (push + notificationclick). لا تخزين مؤقت ولا اعتراض للطلبات: سلوك الموقع لا يتغيّر.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const title = String(d.title || 'فريق الجالية').slice(0, 60), body = String(d.body || '').slice(0, 160);
  const url = typeof d.url === 'string' && /^\/[A-Za-z0-9_.\/#?=&%-]{0,199}$/.test(d.url) ? d.url : '/';
  e.waitUntil(self.registration.showNotification(title, { body, icon: '/assets/icons/icon-192.png', badge: '/assets/icons/icon-192.png', dir: 'rtl', lang: 'ar', data: { url } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.location.origin + '/') && !c.url.includes('/admin/') && 'focus' in c) { return c.navigate(url).then(x => (x || c).focus()).catch(() => c.focus()); } }
    return self.clients.openWindow(url);
  }));
});
