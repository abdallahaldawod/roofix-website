/**
 * Which external sources the local scanner worker should scan.
 * Shared by scripts/scanner-worker.ts and scripts/scanner-pm2-watch.ts.
 */

import type { LeadSource } from "./types";

export function getScannableSources(sources: LeadSource[]): LeadSource[] {
  return sources.filter(
    (s) =>
      !s.isSystem &&
      (s.storageStatePath?.trim() ?? "") !== "" &&
      (s.leadsUrl?.trim() ?? "") !== "" &&
      s.status === "Active"
  );
}
