/**
 * Pick a Firestore lead source suitable for Hipages jobs list sync (session + Hipages identity).
 * Used by control-centre Sync jobs and the local scanner worker.
 */

import type { LeadSource } from "./types";

/** True if this source can be used for Hipages jobs import (Active, session, identifiable as Hipages). */
export function isHipagesJobsSourceCandidate(s: LeadSource): boolean {
  if (s.status !== "Active" || s.isSystem) return false;
  if (!(s.storageStatePath?.trim())) return false;
  const name = s.name.toLowerCase();
  const platform = (s.platform ?? "").toLowerCase();
  const leadsUrl = (s.leadsUrl ?? "").toLowerCase();
  return (
    name.includes("hipages") ||
    platform.includes("hipages") ||
    leadsUrl.includes("hipages.com")
  );
}

/** First matching source (stable order as returned by getSources). */
export function pickFirstHipagesJobsSource(sources: LeadSource[]): LeadSource | null {
  const hipages = sources.filter(isHipagesJobsSourceCandidate);
  return hipages[0] ?? null;
}
