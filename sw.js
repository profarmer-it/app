/* ============================================================================
   App Pro Farmer — service worker (dal 29/10/2026)
   ----------------------------------------------------------------------------
   Tiene sul telefono la pagina, gli stili, gli script e i font, così l'app si
   apre anche senza rete (in stalla il segnale è spesso debole) e la
   timbratura finisce nella coda del telefono. Le chiamate a Supabase vanno
   sempre in rete. Come Riposa: prima la rete per la pagina, poi la copia; i
   file in assets/ cambiano nome con ?v=. Cambiare CACHE solo per buttare via tutto.
   ========================================================================== */

const CACHE = 'pf-v2';   // i file nuovi arrivano con ?v= in index.html (v2, 30/10: Riposa è un'app a sé)

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const pagina = await fetch('./', { cache: 'no-cache' });
    const html = await pagina.clone().text();
    await cache.put('./', pagina);
    const file = new Set(['manifest.webmanifest', 'assets/logo-bianco.png']);
    for (const m of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) file.add(m[1]);
    for (const f of [...file]) {
      if (!/\.css(\?|$)/.test(f)) continue;
      const css = await (await fetch(f)).text();
      const base = f.replace(/[^/]*$/, '');
      for (const m of css.matchAll(/url\('?([^')]+)'?\)/g)) file.add(base + m[1]);
    }
    await Promise.all([...file].map(f => cache.add(f).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // le librerie da cdnjs (lettore QR, Excel) restano in copia: servono anche dopo
  const cdn = url.origin === 'https://cdnjs.cloudflare.com';
  if (url.origin !== location.origin && !cdn) return;

  if (req.mode === 'navigate') {
    const pagina = './';
    ev.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && /^\/(index\.html)?$/.test(url.pathname)) (await caches.open(CACHE)).put(pagina, r.clone());
        return r;
      } catch (e) {
        return (await caches.match(req)) || (await caches.match(pagina));
      }
    })());
    return;
  }
  ev.respondWith((async () => {
    const c = await caches.match(req);
    if (c) return c;
    const r = await fetch(req);
    if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
    return r;
  })());
});

/* Le notifiche: le manda la funzione pf-notifica (ferie decise, turni
   pubblicati, promemoria di timbratura, uscite non timbrate). */
self.addEventListener('push', ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { testo: ev.data && ev.data.text() }; }
  ev.waitUntil(self.registration.showNotification(d.titolo || 'Pro Farmer', {
    body: d.testo || '',
    icon: 'assets/icone/icona-192.png',
    badge: 'assets/icone/favicon-32.png',
    tag: d.tag || undefined,
    data: { link: d.link || '/' }
  }));
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const link = new URL((ev.notification.data && ev.notification.data.link) || '/', self.location.origin).href;
  ev.waitUntil((async () => {
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate ? c.navigate(link) : null; }
    }
    return self.clients.openWindow(link);
  })());
});
