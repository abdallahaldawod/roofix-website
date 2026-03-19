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
