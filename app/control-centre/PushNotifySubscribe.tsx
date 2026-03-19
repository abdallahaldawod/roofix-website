"use client";

import { useState, useCallback, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Status = "idle" | "loading" | "enabled" | "unsupported" | "blocked" | "error";

export function PushNotifySubscribe() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) setStatus("unsupported");
    else if (Notification.permission === "granted") setStatus("enabled");
  }, []);

  const subscribe = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      setMessage("Push not supported in this browser");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        setMessage("Notifications denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setStatus("error");
        setMessage("Sign in required");
        return;
      }
      const resKey = await fetch("/api/control-centre/push-vapid-public", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const keyData = await resKey.json();
      if (!resKey.ok || !keyData.publicKey) {
        setStatus("error");
        setMessage(keyData.error || "Push not configured");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyData.publicKey,
      });
      const resSave = await fetch("/api/control-centre/push-subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!resSave.ok) {
        const err = await resSave.json();
        setStatus("error");
        setMessage(err.error || "Failed to save subscription");
        return;
      }
      setStatus("enabled");
      setMessage("You’ll get notified for new leads and when you accept a lead.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Failed to enable");
    }
  }, []);

  if (status === "unsupported") {
    return (
      <span className="text-xs text-neutral-500" title={message ?? undefined}>
        Push not supported
      </span>
    );
  }
  if (status === "enabled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
        <Bell className="h-4 w-4 text-emerald-600" aria-hidden />
        Notifications on
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={status === "loading"}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:opacity-50"
      aria-label={status === "blocked" ? "Notifications denied" : "Enable push notifications for new leads"}
    >
      {status === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : status === "blocked" || status === "error" ? (
        <BellOff className="h-4 w-4" aria-hidden />
      ) : (
        <Bell className="h-4 w-4" aria-hidden />
      )}
      {status === "loading"
        ? "Enabling…"
        : status === "blocked"
          ? "Notifications denied"
          : status === "error"
            ? "Enable notifications"
            : "Notify me (new leads)"}
    </button>
  );
}
