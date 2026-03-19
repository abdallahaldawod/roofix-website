/**
 * Normalize raw extracted leads to the common ScannedLead shape.
 * Pure function; no Firestore or UI.
 */

import type { ScannedLead } from "@/lib/leads/types";
import type { RawExtractedLead } from "./adapter-types";
import { stripUndefined } from "@/lib/leads/admin-utils";

export function normalizeToScannedLead(
  raw: RawExtractedLead,
  sourceId: string,
  sourceName: string
): ScannedLead {
  const outRaw = raw.raw ? (stripUndefined(raw.raw as object) as Record<string, unknown>) : undefined;
  // #region agent log
  fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a5692" }, body: JSON.stringify({ sessionId: "7a5692", location: "normalize.ts:normalizeToScannedLead", message: "normalize raw.leadCost", data: { inputLeadCost: raw.raw?.leadCost, outputLeadCost: outRaw?.leadCost }, timestamp: Date.now(), hypothesisId: "B" }) }).catch(() => {});
  // #endregion
  return {
    title: (raw.title ?? "").trim(),
    description: (raw.description ?? "").trim(),
    suburb: (raw.suburb ?? "").trim(),
    postcode: raw.postcode?.trim() || undefined,
    externalId: raw.externalId?.trim() || undefined,
    sourceId,
    sourceName,
    raw: outRaw,
  };
}
