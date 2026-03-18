/**
 * Server-only: raw scanned lead storage (external scan intake).
 * Uses Firebase Admin SDK. Do not import in client code.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { stripUndefined } from "./admin-utils";
import type { ScannedLeadRawCreate } from "./types";

const COLLECTION = "scanned_leads";

/**
 * Writes a raw scanned lead and returns its document id.
 * Sets scannedAt to server timestamp.
 */
export async function writeScannedLeadRaw(
  data: ScannedLeadRawCreate
): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const ref = await db.collection(COLLECTION).add({
    ...stripUndefined(data),
    scannedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Links a scanned lead raw doc to the lead_activity document after processing.
 */
export async function updateScannedLeadRawActivityId(
  id: string,
  activityId: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(id).update({
    activityId,
  });
}

/**
 * Returns an existing scanned lead by source and dedupe key, if any.
 * Used for duplicate detection before processing.
 */
export async function getScannedLeadByDedupeKey(
  sourceId: string,
  dedupeKey: string
): Promise<{ id: string; activityId?: string } | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const snap = await db
    .collection(COLLECTION)
    .where("sourceId", "==", sourceId)
    .where("dedupeKey", "==", dedupeKey)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const data = doc.data();
  return {
    id: doc.id,
    activityId: data.activityId ?? undefined,
  };
}

/**
 * List all scanned_leads for a source (for post-scan cleanup: remove leads no longer on the platform).
 */
export async function listScannedLeadsBySourceId(
  sourceId: string
): Promise<{ id: string; dedupeKey: string; activityId?: string }[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db
    .collection(COLLECTION)
    .where("sourceId", "==", sourceId)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      dedupeKey: data.dedupeKey ?? "",
      activityId: data.activityId ?? undefined,
    };
  });
}

/**
 * Deletes a scanned_leads document. Used when syncing with source (remove leads no longer on platform).
 */
export async function deleteScannedLeadRaw(id: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(id).delete();
}
