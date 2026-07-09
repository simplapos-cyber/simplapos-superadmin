// SimplaPOS Service Worker – PWA + Offline-Betrieb
// v8 – Robustes App-Shell-Caching + Offline-Fallback-Seite
const CACHE_VERSION = 'v8';
const SHELL_CACHE = `simplapos-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `simplapos-assets-${CACHE_VERSION}`;

// ─── Install: App-Shell sofort cachen ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Cache die Haupt-HTML-Seite einzeln (Fehler ignorieren)
      try { await cache.add('/'); } catch (e) {}
      try { await cache.add('/manifest.json'); } catch (e) {}
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: alte Caches löschen ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Offline-Fallback HTML ────────────────────────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SimplaPOS – Offline</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; margin: 0; background: #f8fafc; }
  .box { text-align: center; padding: 2rem; max-width: 320px; }
  h1 { font-size: 1.25rem; color: #1e293b; margin-bottom: 0.5rem; }
  p { color: #64748b; font-size: 0.875rem; line-height: 1.5; }
  button { margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #2563eb;
    color: white; border: none; border-radius: 0.5rem; font-size: 1rem;
    cursor: pointer; width: 100%; border-radius: 8px; }
</style></head>
<body><div class="box">
  <div style="font-size:3rem;margin-bottom:1rem">📶</div>
  <h1>Keine Internetverbindung</h1>
  <p>SimplaPOS konnte nicht geladen werden.<br>
  Bitte stelle eine Internetverbindung her und tippe auf "Erneut versuchen".</p>
  <button onclick="window.location.reload()">Erneut versuchen</button>
</div></body></html>`;

// ─── Fetch: Strategie je nach Request-Typ ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Nur GET-Requests cachen
  if (event.request.method !== 'GET') return;

  // 2. API-Calls: immer Netzwerk, nie cachen
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/__manus__/')) return;
  if (url.pathname.startsWith('/manus-storage/')) return;

  // 3. Navigations-Requests (HTML): Network-First mit App-Shell-Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { credentials: 'same-origin' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => {
              cache.put(event.request, clone);
              // Auch unter '/' speichern als universeller Fallback
              cache.put('/', response.clone());
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline: zuerst exakte URL, dann '/' als Fallback
          const cached = await caches.match(event.request) || await caches.match('/');
          if (cached) return cached;
          // Letzter Ausweg: Offline-Fallback-Seite anzeigen
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 4. Statische Assets (JS, CSS, Fonts, Icons, Bilder): Cache-First mit Netzwerk-Fallback
  const isStaticAsset = (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|svg|ico|webp|gif)$/) ||
    url.pathname.startsWith('/assets/') ||
    ['/icon-192.png', '/icon-512.png', '/icon-192-maskable.png', '/icon-512-maskable.png',
     '/favicon.png', '/icon-96.png', '/manifest.json'].includes(url.pathname)
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // 5. Alle anderen Requests: Network-First mit Cache-Fallback
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        caches.open(ASSET_CACHE).then((cache) => {
          cache.put(event.request, response.clone());
        });
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

// ─── Background Sync (für Offline-Queue) ─────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(notifyClientsToSync('SYNC_ORDERS'));
  }
  if (event.tag === 'sync-printer') {
    event.waitUntil(notifyClientsToSync('SYNC_PRINTER'));
  }
});

async function notifyClientsToSync(type) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type }));
}

// ─── Message-Handler ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
  // Cache bestimmte URLs auf Anfrage
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(SHELL_CACHE).then((cache) => {
      urls.forEach((url) => {
        fetch(url).then((response) => {
          if (response.ok) cache.put(url, response);
        }).catch(() => {});
      });
    });
  }
});

// ─── Push-Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'SimplaPOS', body: 'Sie haben eine neue Benachrichtigung.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', timestamp: Date.now() },
    tag: data.tag || 'simplapos-notification',
    requireInteraction: false,
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'SimplaPOS', options)
  );
});

// ─── Notification-Klick ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
