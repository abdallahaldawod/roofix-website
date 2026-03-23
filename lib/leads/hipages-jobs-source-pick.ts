import type { LeadSource } from "./types";

function looksLikeHipagesSource(s: LeadSource): boolean {
  const blob = `${s.name} ${s.platform} ${s.type}`.toLowerCase();
  const url = (s.leadsUrl ?? "").toLowerCase();
  return blob.includes("hipages") || url.includes("hipages.com");
}

/** First Active, connected external source that looks like Hipages and has session + leads URL. */
export function pickFirstHipagesJobsSource(sources: LeadSource[]): LeadSource | null {
  for (const s of sources) {
    if (s.isSystem) continue;
    if (s.status !== "Active") continue;
    if (s.authStatus !== "connected") continue;
    if (!(s.storageStatePath?.trim())) continue;
    if (!(s.leadsUrl?.trim())) continue;
    if (!looksLikeHipagesSource(s)) continue;
    return s;
  }
  return null;
}
