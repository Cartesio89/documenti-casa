/* Service worker di Documenti casa: app utilizzabile offline + ricezione file condivisi (Android). */
'use strict';
const VERSION = 'dc-2026-10-18-4';
const SHELL = ['./', 'index.html', 'app.js', 'parse.js', 'style.css', 'manifest.webmanifest',
  'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'vendor/jspdf.umd.min.js', 'vendor/jszip.min.js', 'vendor/pdf/pdf.min.js', 'vendor/pdf/pdf.worker.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('dc-') && k !== VERSION && k !== 'dc-runtime').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* stesso database IndexedDB dell'app */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('documenti-casa', 2);
    r.onupgradeneeded = () => { for (const s of ['pending', 'cache', 'shared']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function saveShared(payload) {
  const db = await idb();
  await new Promise((res, rej) => { const t = db.transaction('shared', 'readwrite'); t.objectStore('shared').put(payload, 'last'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('files').filter((f) => f && f.size);
        await saveShared({ at: Date.now(), title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '',
          files: files.map((f) => ({ name: f.name, type: f.type, blob: f })) });
      } catch (err) { /* si apre comunque l'app */ }
      return Response.redirect(new URL('./#/nuovo?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.github.com') return; // dati: mai dalla cache

  if (url.origin === location.origin) {
    const isVendor = url.pathname.includes('/vendor/') || /\.(png|svg)$/.test(url.pathname);
    if (isVendor) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { const c = await caches.open('dc-runtime'); c.put(req, res.clone()); }
  return res;
}
async function networkFirst(req) {
  const isNav = req.mode === 'navigate';
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 4000))]);
    if (res.ok) { const c = await caches.open(VERSION); c.put(isNav ? 'index.html' : req, res.clone()); }
    return res;
  } catch (err) {
    const hit = await caches.match(isNav ? 'index.html' : req, { ignoreSearch: true }) || (isNav ? await caches.match('./') : null);
    if (hit) return hit;
    throw err;
  }
}
