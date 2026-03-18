/**
 * Resolves a source adapter by platform id. Used by the scan runner.
 */

import type { SourceAdapter } from "../adapter-types";
import { HipagesAdapter } from "./hipages-adapter";

const adapters: Map<string, SourceAdapter> = new Map([
  ["hipages", new HipagesAdapter()],
]);

export function getAdapter(platformId: string): SourceAdapter | null {
  const normalized = platformId.toLowerCase().trim();
  return adapters.get(normalized) ?? null;
}

/**
 * Find an adapter whose leadsUrlHostname matches the hostname of the given URL.
 * Used when source.platform is a generic value like "external" rather than a specific platform id.
 */
export function getAdapterByUrl(leadsUrl: string): SourceAdapter | null {
  let hostname: string;
  try {
    hostname = new URL(leadsUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  for (const adapter of adapters.values()) {
    if (adapter.leadsUrlHostname && hostname.endsWith(adapter.leadsUrlHostname.toLowerCase())) {
      return adapter;
    }
  }
  return null;
}
