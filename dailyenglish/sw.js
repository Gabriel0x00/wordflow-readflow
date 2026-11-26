const APP_CACHE = 'dailyenglish-30a555564106410e';
const root = new URL(self.registration.scope);
const shell = new URL('./', root).href;
const offlineFiles = ['index.html', 'instalar.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo.png', 'app-977ed2b82346ff5f.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(offlineFiles.map(path => new Request(new URL(path, root), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name.startsWith('dailyenglish-') && name !== APP_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(shell)) return;

  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    if (request.mode !== 'navigate') {
      return (await cache.match(request)) || fetch(request);
    }
    try {
      return await fetch(request, { cache: 'no-cache' });
    } catch {
      const fallback = new URL(request.url).pathname.endsWith('/instalar.html') ? 'instalar.html' : 'index.html';
      return (await cache.match(new URL(fallback, root))) || Response.error();
    }
  })());
});
