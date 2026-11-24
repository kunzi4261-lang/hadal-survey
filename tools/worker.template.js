const base = self.registration.scope;
const prefix = 'hadal-survey:' + new URL(base).pathname + ':';
const cacheId = prefix + '__HADAL_BUILD__';
const files = /* ASSET_TABLE */ [];
const urls = new Set(files.map((file) => new URL(file, base).href));
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheId)
      .then((cache) => cache.addAll([...urls].map((url) => new Request(url, { cache: 'reload' })))),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix) && name !== cacheId)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  const key =
    event.request.mode === 'navigate' && [base, new URL('index.html', base).href].includes(url.href)
      ? new URL('index.html', base).href
      : url.href;
  if (!urls.has(key)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheId);
      return (await cache.match(key)) || fetch(event.request);
    })(),
  );
});
