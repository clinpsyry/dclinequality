// Service worker for the installed (home-screen) app.
// Network first, so a new deploy always shows at once; the cache is only a
// fallback, so the app still opens with no signal.
var CACHE = "explorer-v1";
var CORE = ["./", "index.html", "manifest.webmanifest", "js/plotly.min.js", "js/stats.js",
  "js/families.js", "js/explorer.js", "js/gifenc.js", "data.js", "census.js",
  "fonts/inter-400.woff2", "fonts/inter-600.woff2", "fonts/inter-700.woff2",
  "icons/icon.svg", "icons/icon-192.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // one by one, so a single missing file never blocks the install
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
    });
  }));
});
