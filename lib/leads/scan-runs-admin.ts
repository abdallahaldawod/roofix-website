/**
 * Server-only: scan run history (collection: scan_runs).
 * Do not import in client code.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { ScanRun, ScanRunCreate, LastScanDebug } from "./types";
import { toFsTimestamp } from "./admin-utils";

const COLLECTION = "scan_runs";
const ERROR_MESSAGE_MAX_LEN = 500;

type DocData = Record<string, unknown>;

function toScanRun(id: string, d: DocData): ScanRun {
  return {
    id,
    sourceId: (d.sourceId as string) ?? "",
    startedAt: toFsTimestamp(d.startedAt)!,
    finishedAt: toFsTimestamp(d.finishedAt)!,
    status: (d.status as ScanRun["status"]) ?? "failed",
    extracted: (d.extracted as number) ?? undefined,
    duplicate: (d.duplicate as number) ?? undefined,
    imported: (d.imported as number) ?? undefined,
    failedExtraction: (d.failedExtraction as number) ?? undefined,
    failedImport: (d.failedImport as number) ?? undefined,
    errorMessage: (d.errorMessage as string) ?? undefined,
    debug: d.debug as LastScanDebug | undefined,
  };
}

export type WriteScanRunPayload = Omit<
  ScanRunCreate,
  "startedAt" | "finishedAt"
> & {
  /** Start time as milliseconds since epoch (from Date.now() at scan start). */
  startedAtMs: number;
};

/**
 * Write a scan run record. Call at end of each background scan (success or failure).
 */
export async function writeScanRunAdmin(data: WriteScanRunPayload): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const errorMessage =
    data.errorMessage != null && data.errorMessage.length > ERROR_MESSAGE_MAX_LEN
      ? data.errorMessage.slice(0, ERROR_MESSAGE_MAX_LEN) + "…"
      : data.errorMessage;
  // Firestore rejects undefined values; use null for absent numeric counts.
  const payload = {
    sourceId: data.sourceId,
    startedAt: Timestamp.fromMillis(data.startedAtMs),
    finishedAt: FieldValue.serverTimestamp(),
    status: data.status,
    extracted: data.extracted ?? null,
    duplicate: data.duplicate ?? null,
    imported: data.imported ?? null,
    failedExtraction: data.failedExtraction ?? null,
    failedImport: data.failedImport ?? null,
    errorMessage: errorMessage ?? null,
    debug: data.debug ?? null,
  };
  const ref = await db.collection(COLLECTION).add(payload);
  return ref.id;
}

/**
 * Get recent scan runs for a source, newest first.
 */
export async function getRecentScanRunsAdmin(
  sourceId: string,
  limit = 10
): Promise<ScanRun[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db
    .collection(COLLECTION)
    .where("sourceId", "==", sourceId)
    .orderBy("startedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => toScanRun(d.id, d.data()));
}
