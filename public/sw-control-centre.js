// Control Centre PWA: install, activate, and push notifications.
const SW_VERSION = "control-centre-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = { type: "new_lead", title: "New lead", url: "/control-centre/leads" };
  try {
    const parsed = event.data.json();
    if (parsed && typeof parsed.title === "string") {
      data = {
        type: parsed.type || "new_lead",
        title: parsed.title,
        activityId: parsed.activityId,
        url: parsed.url || "/control-centre/leads",
        tag: parsed.tag || "lead",
      };
    }
  } catch (_) {}
  const title = data.type === "lead_accepted" ? "Lead accepted" : "New lead";
  const body = data.title.length > 80 ? data.title.slice(0, 77) + "…" : data.title;
  const options = {
    body,
    tag: data.tag || "lead",
    data: { url: data.url },
    icon: "/android-chrome-192x192.png",
    badge: "/android-chrome-192x192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/control-centre/leads";
  const fullUrl = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(fullUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl);
    })
  );
});
