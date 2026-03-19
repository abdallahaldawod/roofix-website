"use client";

import { useEffect } from "react";

export function RegisterControlCentreSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const path = "/sw-control-centre.js";
    navigator.serviceWorker
      .register(path, { scope: "/control-centre/" })
      .then(() => {})
      .catch(() => {});
  }, []);
  return null;
}
