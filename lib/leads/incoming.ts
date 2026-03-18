/**
 * Server-only: raw incoming lead intake (e.g. website form).
 * Uses Firebase Admin SDK. Do not import in client code.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { IncomingLeadCreate } from "./types";

const COLLECTION = "incoming_leads";

/**
 * Writes a raw incoming lead and returns its document id.
 * Sets createdAt to server timestamp.
 */
export async function writeIncomingLead(
  data: IncomingLeadCreate
): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const ref = await db.collection(COLLECTION).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Marks an incoming lead as processed and links it to the lead_activity document.
 */
export async function updateIncomingLeadProcessed(
  id: string,
  activityId: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(id).update({
    processedAt: FieldValue.serverTimestamp(),
    activityId,
  });
}
