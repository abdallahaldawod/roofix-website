"use client";

import { collection, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { HipagesJob } from "./hipages-jobs-types";
import { docToHipagesJob } from "./hipages-jobs-mapper";

const COLLECTION = "hipages_jobs";

/**
 * Live listener for `hipages_jobs`. Sorting is done in the page client.
 */
export function subscribeToHipagesJobs(
  onData: (jobs: HipagesJob[]) => void,
  onError: (err: Error) => void
): () => void {
  const db = getFirestoreDb();
  const colRef = collection(db, COLLECTION);
  return onSnapshot(
    colRef,
    (snap) => {
      const jobs = snap.docs.map((d) => docToHipagesJob(d.id, d.data()));
      onData(jobs);
    },
    (err) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  );
}
