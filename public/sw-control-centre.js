// Minimal service worker for Control Centre PWA (required for iOS Add to Home Screen).
// All requests go to network; no offline caching.
const SW_VERSION = "control-centre-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
