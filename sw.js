// Offline play (Eddie, 2026-10-23: "when I'm offline I couldn't play the game"). After the first online visit this worker stores
// every file of this build (precache.json, written by vite.config.ts) and from then on serves the game from the phone:
//   the page itself   network first (a new build arrives whenever the phone is online), the stored copy when offline;
//   everything else   the stored copy first (built files are content-hashed or fixed per build), else the network, kept.
// One cache per build (ld-<build id>, from ?v= on this script's URL); a newer build replaces it and the older one is deleted.
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `ld-${V}`;

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const { files } = await (await fetch(`./precache.json?v=${V}`, { cache: 'no-store' })).json();
  const queue = [...files];
  const one = async () => { for (let f; (f = queue.shift());) { try { const r = await fetch(f, { cache: 'no-cache' }); if (r.ok) await cache.put(f, r); } catch { /* offline mid-install: the rest is stored as it is used */ } } };
  await Promise.all(Array.from({ length: 6 }, one));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('ld-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put('./', c)); } return r; })
      .catch(async () => (await caches.match('./', { cacheName: CACHE, ignoreVary: true })) ?? (await caches.match('./index.html')) ?? Response.error()));
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });   // a module script asks with an Origin header the stored copy was fetched without
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); }
    return r;
  })());
});
