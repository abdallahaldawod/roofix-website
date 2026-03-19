/**
 * Real-time Firestore subscription for hipages_jobs (onSnapshot).
 * Style-aligned with subscribeToActivity: server snapshot preference, limit, orderBy.
 */

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { HipagesJob } from "./hipages-jobs-types";
import {
  DEFAULT_HIPAGES_JOBS_QUERY_LIMIT,
  HIPAGES_JOBS_COLLECTION,
  mapFirestoreDocToHipagesJob,
} from "./hipages-jobs-mapper";

export type SubscribeToHipagesJobsOptions = {
  /** Max documents (default 100). */
  limitCount?: number;
};

/**
 * Subscribe to hipages_jobs ordered by last scan time (newest first).
 * Uses scannedAt (always set on upsert); same wall time as syncedAt in current pipeline.
 */
export function subscribeToHipagesJobs(
  callback: (jobs: HipagesJob[]) => void,
  onError?: (err: Error) => void,
  options?: SubscribeToHipagesJobsOptions
): () => void {
  const db = getFirestoreDb();
  const lim = options?.limitCount ?? DEFAULT_HIPAGES_JOBS_QUERY_LIMIT;
  const q = query(
    collection(db, HIPAGES_JOBS_COLLECTION),
    orderBy("scannedAt", "desc"),
    limit(lim)
  );
  let hasReceivedServerSnapshot = false;
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const fromCache = snap.metadata?.fromCache ?? false;
      if (fromCache && hasReceivedServerSnapshot) return;
      if (!fromCache) hasReceivedServerSnapshot = true;
      callback(snap.docs.map((doc) => mapFirestoreDocToHipagesJob(doc.id, doc.data())));
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}
