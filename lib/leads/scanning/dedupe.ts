/**
 * Dedupe helpers for scanned leads. Server-only (uses Admin Firestore).
 */

import { createHash } from "crypto";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getScannedLeadByDedupeKey } from "@/lib/leads/scanned-leads-admin";

/**
 * Computes a stable dedupe key: sourceId:externalId when externalId is present,
 * otherwise a hash of sourceId + title + suburb + postcode.
 */
export function computeDedupeKey(
  sourceId: string,
  externalId?: string | null,
  fallbackPayload?: { title: string; suburb: string; postcode?: string }
): string {
  if (externalId != null && String(externalId).trim() !== "") {
    return `${sourceId}:${String(externalId).trim()}`;
  }
  if (fallbackPayload) {
    const str = [sourceId, fallbackPayload.title, fallbackPayload.suburb, fallbackPayload.postcode ?? ""].join("|");
    return createHash("sha256").update(str).digest("hex").slice(0, 32);
  }
  return createHash("sha256").update(sourceId + "|").digest("hex").slice(0, 32);
}

/**
 * Returns true if a lead with this sourceId and dedupeKey was already processed (has activityId)
 * AND the referenced lead_activity document still exists.
 *
 * If the raw record has an activityId but the lead_activity was deleted (e.g. manually by the user),
 * the raw record is cleaned up so the lead can be re-imported on the next scan.
 */
export async function isLeadAlreadyProcessed(
  sourceId: string,
  dedupeKey: string
): Promise<boolean> {
  const existing = await getScannedLeadByDedupeKey(sourceId, dedupeKey);

  // No raw record at all → not a duplicate.
  if (existing == null) return false;

  // Raw record exists but was never linked to an activity → not yet fully processed.
  if (existing.activityId == null || existing.activityId === "") return false;

  // Raw record has an activityId — verify the lead_activity document still exists.
  const db = getAdminFirestore();
  if (!db) return true; // Can't verify — err on the side of caution.

  const activityDoc = await db
    .collection("lead_activity")
    .doc(existing.activityId)
    .get();

  if (!activityDoc.exists) {
    // Lead was deleted from lead_activity — clean up the stale raw record so it
    // re-imports cleanly on the next scan.
    await db.collection("scanned_leads").doc(existing.id).delete().catch(() => {});
    return false;
  }

  return true;
}
