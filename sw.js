/* Service worker：預快取整個 app（殼 + 10 份單元 JSON），離線完全可用。
   更新流程：改版時把 VERSION +1，舊快取在 activate 時清掉。 */
const VERSION = "v1.3.0";
const CACHE = "toeic-vocab-" + VERSION;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/store.js",
  "./js/speech.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  ...Array.from({ length: 32 }, (_, i) =>   // 與 config.js UNITS 同步
    `./data/units/unit-${String(i + 1).padStart(2, "0")}.json`),
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* cache-first；不在快取的（例如未來加的資源）走網路並順手放進快取 */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    ).catch(() =>
      // 離線且快取未命中：導航退回殼頁，其餘回 504 而非拋未處理拒絕
      e.request.mode === "navigate"
        ? caches.match("./index.html")
        : new Response("", { status: 504, statusText: "offline" })
    )
  );
});
