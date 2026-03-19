/**
 * Server-only: hipages_jobs collection (Admin SDK).
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { stripUndefined } from "./admin-utils";

const COLLECTION = "hipages_jobs";

/** Fields written by the sync pipeline (excluding server timestamps). */
export type HipagesJobUpsertPayload = {
  jobId: string;
  href: string;
  sourceId: string;
  /** Platform label; always "Hipages" for this pipeline. */
  sourceName: "Hipages";
  customerName?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  title?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  serviceType?: string | null;
  attachments?: { url: string; label?: string }[];
  leadCost?: string | null;
  leadCostCredits?: number | null;
  postedAt?: { seconds: number; nanoseconds: number } | null;
  postedAtIso?: string | null;
  postedAtText?: string | null;
  email?: string | null;
  phone?: string | null;
  jobStatus?: string | null;
  canCreateQuote?: boolean;
  source: "hipages";
};

export async function getHipagesJobByIdAdmin(jobId: string): Promise<Record<string, unknown> | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const doc = await db.collection(COLLECTION).doc(jobId).get();
  if (!doc.exists) return null;
  return doc.data() as Record<string, unknown>;
}

/**
 * Upsert by jobId (document id). Sets scannedAt and syncedAt to server time every sync.
 */
export async function upsertHipagesJobAdmin(jobId: string, data: HipagesJobUpsertPayload): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin not available");
  const payload = stripUndefined({ ...data, jobId } as object);
  const now = FieldValue.serverTimestamp();
  await db
    .collection(COLLECTION)
    .doc(jobId)
    .set(
      {
        ...payload,
        scannedAt: now,
        syncedAt: now,
        /** Legacy field renamed to `attachments`; remove on each upsert. */
        images: FieldValue.delete(),
      },
      { merge: true }
    );
}
