// Service Worker портала: оболочка приложения офлайн + Web Push.
// Кэшируем только то, что безопасно: неизменяемые файлы /assets/* (в имени хэш) и иконки. API и страницы всегда идут в сеть —
// данные сотрудников не оседают в кэше. Если сети нет, при открытии портала показываем сохранённую оболочку.
const VERSION = 'qadam-v2';   // новая версия при смене меню: старая оболочка из кэша PWA не должна показать прежнее меню
const SHELL = ['/', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    // файл с хэшем в имени не меняется: сначала кэш, при промахе — сеть и запись в кэш
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (req.mode === 'navigate') {
    // страница: всегда свежая из сети, офлайн — сохранённая оболочка
    e.respondWith(fetch(req).catch(() => caches.match('/')));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Qadam', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { url: d.url || '/#/' },
    tag: d.url || undefined,       // несколько сообщений из одного чата не копятся в шторке
    renotify: !!d.url,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
