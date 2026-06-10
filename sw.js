// 축구 스카우터 — 서비스워커 (오프라인 캐시)
var CACHE = "scouter-v0.76";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./comments.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  // 외부 도메인(Supabase API·ESPN·CDN 등)은 SW가 절대 개입하지 않음 → 항상 최신(캐시 안 함).
  // (이전엔 cache-first로 잡혀서 댓글/좋아요가 즉시 반영 안 되던 버그)
  if (url.origin !== self.location.origin) return;
  // 앱 셸/데이터(html/css/js)는 네트워크 우선 → 배포 즉시 반영. 오프라인이면 캐시.
  var shell = e.request.mode === "navigate" || /\.(html|css|js|json)$/.test(url.pathname) ||
    url.pathname === "/" || url.pathname.slice(-1) === "/";
  if (shell) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (h) { return h || caches.match("./index.html"); });
      })
    );
  } else {
    // 이미지/아이콘 등은 캐시 우선(빠름)
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          return res;
        }).catch(function () { return caches.match("./index.html"); });
      })
    );
  }
});
