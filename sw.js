// slot's service worker: the whole app is one page and a few icons, so all of
// it is cached on install and an installed copy opens in airplane mode.
//
// Every request is answered from the cache at once and refreshed from the
// network behind it, so a deploy reaches you on the launch after the one that
// fetched it. Bump VERSION only to change what gets precached.
const VERSION = "slot-v1";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // "./" and "index.html" are the same page; a query string never changes it.
  const key = req.mode === "navigate" ? new URL("./", self.registration.scope).href : req;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(key, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => hit);
        if (hit) e.waitUntil(fresh);
        return hit || fresh;
      })
    )
  );
});
