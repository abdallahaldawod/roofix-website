/**
 * Client-side subscription to the lead action queue for real-time status in the dashboard.
 * Requires Firestore rules to allow read for admin users on lead_action_queue.
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  type DocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";

const COLLECTION = "lead_action_queue";
const IN_QUERY_LIMIT = 30;

export type LeadActionQueueStatus = "pending" | "processing" | "success" | "failed";

export type LeadActionQueueAction = "accept" | "decline" | "waitlist";

/** Latest queue record for one lead + action. */
export type LeadActionStatus = {
  status: LeadActionQueueStatus;
  error?: string | null;
  action: LeadActionQueueAction;
};

/**
 * Key: `${leadId}:${action}`. Value: latest queue status for that lead and action.
 * Used to drive Accept/Decline/Waitlist button state per row.
 */
export type ActionStatusByLeadAndAction = Record<string, LeadActionStatus>;

function requestedAtSeconds(doc: DocumentSnapshot): number {
  const data = doc.data();
  const t = data?.requestedAt;
  if (!t) return 0;
  if (typeof t?.seconds === "number") return t.seconds;
  if (typeof (t as { toMillis?: () => number })?.toMillis === "function") {
    return (t as { toMillis: () => number }).toMillis() / 1000;
  }
  return 0;
}

function buildStatusMap(snap: QuerySnapshot): ActionStatusByLeadAndAction {
  const byKey = new Map<string, { seconds: number; status: LeadActionStatus }>();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const leadId = data?.leadId as string | undefined;
    const action = data?.action as LeadActionQueueAction | undefined;
    const status = data?.status as LeadActionQueueStatus | undefined;
    if (!leadId || !action || !status) return;
    const key = `${leadId}:${action}`;
    const seconds = requestedAtSeconds(doc);
    const existing = byKey.get(key);
    if (existing && existing.seconds >= seconds) return;
    byKey.set(key, {
      seconds,
      status: {
        status,
        error: data?.error as string | null | undefined,
        action,
      },
    });
  });
  const out: ActionStatusByLeadAndAction = {};
  byKey.forEach((v, k) => {
    out[k] = v.status;
  });
  return out;
}

/**
 * Subscribe to queue documents for the given lead IDs. Callback receives a map of
 * `${leadId}:${action}` -> latest status. Batches leadIds in chunks of 30 for Firestore 'in' limit.
 * Returns an unsubscribe function.
 */
export function subscribeToLeadActionQueue(
  leadIds: string[],
  callback: (statusByLeadAndAction: ActionStatusByLeadAndAction) => void,
  onError?: (err: Error) => void
): () => void {
  const db = getFirestoreDb();
  const unsubs: (() => void)[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += IN_QUERY_LIMIT) {
    chunks.push(leadIds.slice(i, i + IN_QUERY_LIMIT));
  }
  if (chunks.length === 0) {
    callback({});
    return () => {};
  }
  const merged = new Map<string, LeadActionStatus>();
  const actions: LeadActionQueueAction[] = ["accept", "decline", "waitlist"];
  function emit() {
    const obj: ActionStatusByLeadAndAction = {};
    merged.forEach((v, k) => {
      obj[k] = v;
    });
    callback(obj);
  }
  function merge(snap: QuerySnapshot, chunkLeadIds: string[]) {
    const keysForChunk = new Set<string>();
    chunkLeadIds.forEach((leadId) => {
      actions.forEach((action) => keysForChunk.add(`${leadId}:${action}`));
    });
    keysForChunk.forEach((k) => merged.delete(k));
    const map = buildStatusMap(snap);
    Object.entries(map).forEach(([key, status]) => {
      merged.set(key, status);
    });
    emit();
  }
  chunks.forEach((chunk) => {
    const q = query(
      collection(db, COLLECTION),
      where("leadId", "in", chunk)
    );
    const unsub = onSnapshot(
      q,
      (snap) => merge(snap, chunk),
      (err) => onError?.(err instanceof Error ? err : new Error(String(err)))
    );
    unsubs.push(unsub);
  });
  return () => {
    unsubs.forEach((u) => u());
  };
}

/** Helper: get status for a lead and action from the map. */
export function getActionStatus(
  statusByLeadAndAction: ActionStatusByLeadAndAction,
  leadId: string,
  action: LeadActionQueueAction
): LeadActionStatus | undefined {
  return statusByLeadAndAction[`${leadId}:${action}`];
}
