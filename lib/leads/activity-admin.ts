/**
 * Server-only: write lead activity via Admin SDK.
 * Do not import in client code.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { stripUndefined } from "./admin-utils";
import type { LeadActivityCreate } from "./types";

const COLLECTION = "lead_activity";

/**
 * Writes a processed lead activity record. Sets scannedAt to server timestamp.
 */
export async function writeActivityRecordAdmin(
  data: LeadActivityCreate
): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  // #region agent log
  const payload = stripUndefined(data);
  fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d2b155" }, body: JSON.stringify({ sessionId: "d2b155", location: "activity-admin.ts:writeActivityRecordAdmin", message: "write_leadCost", data: { hasLeadCost: "leadCost" in payload && payload.leadCost != null, leadCostValue: (payload as { leadCost?: string }).leadCost ?? null }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
  // #endregion
  const ref = await db.collection(COLLECTION).add({
    ...payload,
    scannedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Platform-sourced fields we can update when re-scanning an existing lead. */
export type LeadActivityPlatformUpdate = Partial<{
  title: string;
  description: string;
  suburb: string;
  postcode: string;
  customerName: string;
  serviceType: string;
  postedAt: { seconds: number; nanoseconds: number };
  postedAtIso: string;
  postedAtText: string;
  leadCost: string;
  jobId?: string;
  hipagesActions: Record<string, unknown>;
  attachments: { url: string; label?: string }[];
}>;

/**
 * Fetches a lead_activity document by id. Returns null if not found.
 */
export async function getActivityByIdAdmin(
  activityId: string
): Promise<Record<string, unknown> | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const doc = await db.collection(COLLECTION).doc(activityId).get();
  if (!doc.exists) return null;
  return doc.data() as Record<string, unknown>;
}

/**
 * Returns all lead_activity docs for a source (for matching during import).
 */
export async function getActivitiesBySourceIdAdmin(
  sourceId: string
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).where("sourceId", "==", sourceId).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

/**
 * Updates only platform-sourced fields on an existing activity (e.g. after re-scan).
 */
export async function updateActivityAdmin(
  activityId: string,
  data: LeadActivityPlatformUpdate
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(activityId).update(stripUndefined(data as object));
}

/**
 * Updates acceptance or customer fields on an existing activity (e.g. after user accepts on hipages or fetches job details).
 */
export async function updateActivityFieldsAdmin(
  activityId: string,
  fields: Partial<{ platformAccepted: boolean; customerName: string; email: string; phone: string }>
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(activityId).update(stripUndefined(fields as object));
}

/** Rule-engine result fields to persist when re-applying rules to an existing lead. */
export type LeadActivityRuleResultUpdate = {
  matchedKeywords: string[];
  excludedMatched: string[];
  score: number;
  scoreBreakdown: { keyword: string; score: number }[];
  decision: "Accept" | "Review" | "Reject";
  reasons: string[];
  timeline: { time: string; event: string }[];
  status: "Processed" | "Failed";
  ruleSetId: string;
};

/**
 * Updates rule evaluation result on an existing activity (e.g. after re-applying rules to existing leads).
 */
export async function updateActivityRuleResultAdmin(
  activityId: string,
  data: LeadActivityRuleResultUpdate
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(activityId).update(stripUndefined(data as object));
}

/**
 * Deletes a lead_activity document by id. Used when syncing with source (remove leads no longer on platform).
 */
export async function deleteActivityById(id: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(id).delete();
}
