/**
 * Server-only: Firestore helpers for the lead action queue (lead_action_queue).
 * Do not import in client code.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { stripUndefined, toFsTimestamp } from "@/lib/leads/admin-utils";
import type {
  LeadActionQueueCreate,
  LeadActionQueueDocument,
} from "@/lib/leads/action-queue-types";

const COLLECTION = "lead_action_queue";

function docToQueueDocument(
  id: string,
  data: Record<string, unknown>
): LeadActionQueueDocument {
  return {
    id,
    leadId: (data.leadId as string) ?? "",
    sourceId: (data.sourceId as string) ?? "",
    externalId: data.externalId as string | undefined,
    action: (data.action as LeadActionQueueDocument["action"]) ?? "accept",
    status: (data.status as LeadActionQueueDocument["status"]) ?? "pending",
    requestedAt: toFsTimestamp(data.requestedAt) ?? null,
    requestedBy: (data.requestedBy as string) ?? "",
    startedAt: toFsTimestamp(data.startedAt) ?? undefined,
    completedAt: toFsTimestamp(data.completedAt) ?? undefined,
    error: data.error as string | null | undefined,
    resultSummary: data.resultSummary as string | null | undefined,
    actionPath: data.actionPath as string | null | undefined,
  };
}

/**
 * Enqueue a lead action request. Returns the new document id or null if db unavailable.
 */
export async function createActionRequest(
  params: LeadActionQueueCreate
): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const payload = stripUndefined({
    leadId: params.leadId,
    sourceId: params.sourceId,
    action: params.action,
    requestedBy: params.requestedBy,
    status: "pending" as const,
    requestedAt: FieldValue.serverTimestamp(),
    ...(params.externalId != null && { externalId: params.externalId }),
    ...(params.actionPath != null && { actionPath: params.actionPath }),
  });
  const ref = await db.collection(COLLECTION).add(payload);
  return ref.id;
}

const DEFAULT_PENDING_LIMIT = 50;
/** Max pending docs to fetch when sorting in memory (avoids composite index until index is deployed). */
const PENDING_FETCH_CAP = 100;

/**
 * Fetch pending action requests, ordered by requestedAt asc. For use by the local worker.
 * Uses status-only query and sorts in memory so the worker works without the composite index
 * (status + requestedAt); deploy firestore indexes for better scalability.
 */
export async function getPendingActionRequests(
  limit: number = DEFAULT_PENDING_LIMIT
): Promise<LeadActionQueueDocument[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db
    .collection(COLLECTION)
    .where("status", "==", "pending")
    .limit(PENDING_FETCH_CAP)
    .get();
  const docs = snap.docs.map((d) => docToQueueDocument(d.id, d.data() as Record<string, unknown>));
  const byRequested = (a: LeadActionQueueDocument, b: LeadActionQueueDocument): number => {
    const pa = a.action === "accept" ? 0 : 1;
    const pb = b.action === "accept" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = a.requestedAt ? a.requestedAt.seconds * 1000 + (a.requestedAt.nanoseconds ?? 0) / 1e6 : 0;
    const tb = b.requestedAt ? b.requestedAt.seconds * 1000 + (b.requestedAt.nanoseconds ?? 0) / 1e6 : 0;
    return ta - tb;
  };
  docs.sort(byRequested);
  return docs.slice(0, limit);
}

/**
 * Claim the next pending action so only one worker can process it.
 * Uses a Firestore transaction: reads the doc and only if status is still "pending"
 * updates to "processing" and sets startedAt. Returns the document if claimed, null otherwise.
 */
export async function claimNextPendingAction(): Promise<LeadActionQueueDocument | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const pending = await getPendingActionRequests(1);
  if (pending.length === 0) return null;
  const doc = pending[0];
  const ref = db.collection(COLLECTION).doc(doc.id);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || data?.status !== "pending") return false;
    tx.update(ref, {
      status: "processing",
      startedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return claimed ? doc : null;
}

/**
 * Mark a queued action as being processed (worker has picked it up).
 */
export async function markActionProcessing(id: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db
    .collection(COLLECTION)
    .doc(id)
    .update(
      stripUndefined({
        status: "processing",
        startedAt: FieldValue.serverTimestamp(),
      })
    );
}

/**
 * Mark a queued action as completed successfully.
 */
export async function markActionSuccess(
  id: string,
  resultSummary?: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db
    .collection(COLLECTION)
    .doc(id)
    .update(
      stripUndefined({
        status: "success",
        completedAt: FieldValue.serverTimestamp(),
        resultSummary: resultSummary ?? null,
        error: null,
      })
    );
}

/**
 * Mark a queued action as failed.
 */
export async function markActionFailed(id: string, error: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db
    .collection(COLLECTION)
    .doc(id)
    .update(
      stripUndefined({
        status: "failed",
        completedAt: FieldValue.serverTimestamp(),
        error,
      })
    );
}
