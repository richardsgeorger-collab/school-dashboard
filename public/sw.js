// Halo+ service worker: the app shell offline, and push notifications. Assets are hashed by the build
// and cached on first use; navigations go to the network first and fall back to the cached shell.
// sd-3 (2026-09-30): only successful responses are cached. sd-2 cached a code file's 404 during a deploy and served
// that failure from then on ("This screen could not draw" until the cache went); the new version wipes those.
// sd-4 (2026-09-30): only the app's own address is saved as the offline shell. Opening /help/… or privacy.html used
// to overwrite the shell with that page, so the app opened offline as a help page.
const VERSION = 'sd-4';
const SHELL = new URL('./', self.location.href).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([SHELL]).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    const isShell = url.pathname === SHELL || url.pathname === SHELL + 'index.html';
    e.respondWith(fetch(req).then((res) => { if (res.ok && isShell) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(SHELL, copy)); } return res; }).catch(() => caches.match(SHELL)));
    return;
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
  }
});

self.addEventListener('push', (e) => {
  let data = { title: 'Halo+', body: '', url: SHELL };
  try {
    data = { ...data, ...e.data.json() };
  } catch {
    data.body = e.data ? e.data.text() : '';
  }
  // Tagged by the notice's own key: two different notices never replace each other, and a notice that does replace
  // an older copy of itself still alerts (renotify) instead of swapping silently.
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: SHELL + 'icon-192.png', badge: SHELL + 'icon-192.png', data: { url: data.url }, ...(data.tag ? { tag: data.tag, renotify: true } : {}) }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || SHELL;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin + SHELL));
    if (open) return open.focus().then((c) => c.navigate ? c.navigate(url) : undefined);
    return self.clients.openWindow(url);
  }));
});
