const CACHE_VERSION = 'tickets-v1';
const OFFLINE_URL   = '/offline';
const STATIC_EXTS   = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'];

/* ── Install ──────────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, '/logo.png']).catch(() => cache.add('/logo.png')))
      .then(() => self.skipWaiting()),
  );
});

/* ── Activate ─────────────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch ────────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Skip API and Next.js internal requests — network only
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;

  const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));

  // Static assets — cache first
  if (STATIC_EXTS.includes(ext)) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return resp;
        }),
      ),
    );
    return;
  }

  // Navigation — network first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) => cached ?? new Response('Offline', { status: 503 }),
        ),
      ),
    );
  }
});
