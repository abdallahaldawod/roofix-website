"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

const ADMIN_HOST = process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.roofix.com.au";

/**
 * When the app is served on the admin subdomain (admin.roofix.com.au), use '' so
 * links are /, /login, /projects. On the main site use '/control-centre'.
 */
export function useControlCentreBase(): string {
  const pathname = usePathname();
  return useMemo(() => {
    if (typeof window === "undefined") return "/control-centre";
    return window.location.hostname === ADMIN_HOST ? "" : "/control-centre";
  }, []);
}

/**
 * Pathname relative to control centre (e.g. /control-centre/projects -> /projects when on admin).
 */
export function useControlCentrePath(): string {
  const pathname = usePathname() ?? "";
  const base = useControlCentreBase();
  if (!pathname.startsWith("/control-centre")) return pathname;
  const rest = pathname.slice("/control-centre".length) || "/";
  return rest;
}
