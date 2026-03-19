import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { LeadActivity, LeadActivityCreate } from "./types";

const COLLECTION = "lead_activity";

function toLeadActivity(id: string, d: DocumentData): LeadActivity {
  return {
    id,
    title: d.title ?? "",
    description: d.description ?? "",
    sourceId: d.sourceId ?? "",
    sourceName: d.sourceName ?? "",
    suburb: d.suburb ?? "",
    postcode: d.postcode ?? "",
    ruleSetId: d.ruleSetId ?? "",
    matchedKeywords: d.matchedKeywords ?? [],
    excludedMatched: d.excludedMatched ?? [],
    score: d.score ?? 0,
    scoreBreakdown: d.scoreBreakdown ?? [],
    decision: d.decision ?? "Reject",
    status: d.status ?? "Scanned",
    reasons: d.reasons ?? [],
    timeline: d.timeline ?? [],
    scannedAt: d.scannedAt,
    customerName: d.customerName ?? undefined,
    email: d.email ?? undefined,
    phone: d.phone ?? undefined,
    serviceType: d.serviceType ?? undefined,
    postedAt: d.postedAt
      ? { seconds: d.postedAt.seconds ?? 0, nanoseconds: d.postedAt.nanoseconds ?? 0 }
      : undefined,
    postedAtIso: d.postedAtIso ?? undefined,
    postedAtText: d.postedAtText ?? undefined,
    leadCost: d.leadCost ?? undefined,
    leadCostCredits: d.leadCostCredits != null ? d.leadCostCredits : undefined,
    hipagesActions: d.hipagesActions ?? undefined,
    attachments: Array.isArray(d.attachments)
      ? (d.attachments as { url?: string; label?: string }[])
          .map((x) => ({
            url: typeof x?.url === "string" ? x.url.trim() : "",
            label: typeof x?.label === "string" ? x.label.trim() || undefined : undefined,
          }))
          .filter((x) => x.url !== "")
      : undefined,
    platformAccepted: d.platformAccepted === true,
    jobId: typeof d.jobId === "string" ? d.jobId : undefined,
    acceptedConfirmedFromJobsPage: d.acceptedConfirmedFromJobsPage === true,
    acceptedConfirmedAt: toFsTimestamp(d.acceptedConfirmedAt),
    jobsPageLastSeenAt: toFsTimestamp(d.jobsPageLastSeenAt),
  };
}

function toFsTimestamp(
  v: unknown
): { seconds: number; nanoseconds: number } | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as { seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
  const sec = o.seconds ?? o._seconds;
  const nano = o.nanoseconds ?? o._nanoseconds;
  if (typeof sec !== "number" || !Number.isFinite(sec)) return undefined;
  return {
    seconds: sec,
    nanoseconds: typeof nano === "number" && Number.isFinite(nano) ? nano : 0,
  };
}

export async function getActivity(limitCount = 100): Promise<LeadActivity[]> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, COLLECTION),
    orderBy("scannedAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLeadActivity(d.id, d.data()));
}

const ACTIVITY_LIMIT = 100;

/**
 * Subscribe to lead_activity in real time. The callback is called on every change
 * (new, updated, removed). Returns an unsubscribe function.
 * Uses includeMetadataChanges so we can prefer server snapshots over cache and avoid
 * overwriting fresh data (e.g. scanner imports) with stale cached snapshots.
 */
export function subscribeToActivity(
  callback: (leads: LeadActivity[]) => void,
  onError?: (err: Error) => void
): () => void {
  const db = getFirestoreDb();
  const q = query(
    collection(db, COLLECTION),
    orderBy("scannedAt", "desc"),
    limit(ACTIVITY_LIMIT)
  );
  let hasReceivedServerSnapshot = false;
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const fromCache = snap.metadata?.fromCache ?? false;
      if (fromCache && hasReceivedServerSnapshot) {
        return;
      }
      if (!fromCache) hasReceivedServerSnapshot = true;
      const leads = snap.docs.map((d) => toLeadActivity(d.id, d.data()));
      callback(leads);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err)))
  );
}

export async function writeActivityRecord(
  data: LeadActivityCreate
): Promise<string> {
  const db = getFirestoreDb();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    scannedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete one lead_activity document AND its matching scanned_leads raw record
 * so the lead can be re-imported on the next scan.
 * Uses the server-side API route to access the Admin SDK.
 */
export async function deleteActivity(id: string, token: string): Promise<void> {
  const res = await fetch("/api/control-centre/leads/activity", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Delete failed");
  }
}

/**
 * Bulk-delete multiple lead_activity documents and their raw records.
 */
export async function deleteActivities(ids: string[], token: string): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetch("/api/control-centre/leads/activity", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Bulk delete failed");
  }
}

export async function clearActivity(token: string): Promise<void> {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, COLLECTION));
  if (snap.empty) return;
  const ids = snap.docs.map((d) => d.id);
  await deleteActivities(ids, token);
}
