/**
 * Server-only: read lead sources and increment scan counters via Admin SDK.
 * Do not import in client code.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LeadSource, SourceExtractionConfig, LastScanDebug } from "./types";
import {
  INTERNAL_SCAN_METHOD,
  ROOFIX_WEBSITE_PLATFORM as ROOFIX_PLATFORM,
  normalizeAuthStatus,
} from "./types";
import { toFsTimestamp } from "./admin-utils";

const COLLECTION = "lead_sources";

/** Platform id for the built-in Roofix Website system source. Re-export from types for server use. */
export const ROOFIX_WEBSITE_PLATFORM = ROOFIX_PLATFORM;

type DocData = Record<string, unknown>;

function toLeadSource(id: string, d: DocData): LeadSource {
  return {
    id,
    name: (d.name as string) ?? "",
    platform: (d.platform as string) ?? "",
    type: (d.type as string) ?? "",
    status: (d.status as LeadSource["status"]) ?? "Paused",
    mode: (d.mode as LeadSource["mode"]) ?? "Manual",
    ruleSetId: (d.ruleSetId as string) ?? "",
    ruleSetName: (d.ruleSetName as string) ?? "",
    scanMethod: (d.scanMethod as string) ?? "",
    scanFrequency: (d.scanFrequency as number) ?? 15,
    active: (d.active as boolean) ?? false,
    scannedToday: (d.scannedToday as number) ?? 0,
    matchedToday: (d.matchedToday as number) ?? 0,
    lastScanAt: toFsTimestamp(d.lastScanAt),
    createdAt: toFsTimestamp(d.createdAt)!,
    updatedAt: toFsTimestamp(d.updatedAt)!,
    isSystem: (d.isSystem as boolean) ?? false,
    loginUrl: (d.loginUrl as string | undefined) ?? undefined,
    leadsUrl: (d.leadsUrl as string | undefined) ?? undefined,
    authStatus: normalizeAuthStatus(d.authStatus as string | undefined),
    lastAuthAt: toFsTimestamp(d.lastAuthAt) ?? null,
    lastAuthError: (d.lastAuthError as string | null | undefined) ?? null,
    storageStatePath: (d.storageStatePath as string | undefined) ?? undefined,
    lastScanStatus: (d.lastScanStatus as string | undefined) ?? undefined,
    lastScanError: (d.lastScanError as string | null | undefined) ?? null,
    extractionConfig: (d.extractionConfig as SourceExtractionConfig | undefined) ?? undefined,
    lastScanExtracted: (d.lastScanExtracted as number | undefined) ?? undefined,
    lastScanDuplicate: (d.lastScanDuplicate as number | undefined) ?? undefined,
    lastScanFailedExtraction: (d.lastScanFailedExtraction as number | undefined) ?? undefined,
    lastScanImported: (d.lastScanImported as number | undefined) ?? undefined,
    lastScanFailedImport: (d.lastScanFailedImport as number | undefined) ?? undefined,
    lastScanDebug: (d.lastScanDebug as LastScanDebug | undefined) ?? undefined,
    lastScanDurationMs: (d.lastScanDurationMs as number | undefined) ?? undefined,
    extractionDebug: (d.extractionDebug as boolean | undefined) ?? undefined,
  };
}

export async function getSourcesAdmin(): Promise<LeadSource[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => toLeadSource(d.id, d.data() as DocData));
}

/** Get a single source by id (for scripts / server that need per-source auth path). */
export async function getSourceByIdAdmin(
  sourceId: string
): Promise<LeadSource | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const doc = await db.collection(COLLECTION).doc(sourceId).get();
  if (!doc.exists) return null;
  return toLeadSource(doc.id, doc.data() as DocData);
}

/** Default fields for the Roofix Website system source. */
const ROOFIX_WEBSITE_DEFAULT = {
  name: "Roofix Website",
  platform: ROOFIX_WEBSITE_PLATFORM,
  type: "website",
  status: "Active" as const,
  mode: "Manual" as const,
  ruleSetId: "",
  ruleSetName: "",
  scanMethod: INTERNAL_SCAN_METHOD,
  scanFrequency: 15,
  active: true,
  scannedToday: 0,
  matchedToday: 0,
  lastScanAt: null,
  isSystem: true,
};

/**
 * Returns the Roofix Website system source, creating it if it does not exist.
 * Call when processing a website lead so the source is always available.
 */
export async function getOrCreateRoofixWebsiteSourceAdmin(): Promise<LeadSource | null> {
  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .collection(COLLECTION)
    .where("platform", "==", ROOFIX_WEBSITE_PLATFORM)
    .limit(1)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data() as DocData;
    const source = toLeadSource(doc.id, data);
    if (!source.isSystem) {
      await db.collection(COLLECTION).doc(doc.id).update({
        isSystem: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ...source, isSystem: true };
    }
    return source;
  }

  const ref = await db.collection(COLLECTION).add({
    ...ROOFIX_WEBSITE_DEFAULT,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await ref.get();
  return toLeadSource(created.id, created.data() as DocData);
}

export async function incrementScanCountersAdmin(
  id: string,
  scanned: number,
  matched: number
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTION).doc(id).update({
    scannedToday: FieldValue.increment(scanned),
    matchedToday: FieldValue.increment(matched),
    lastScanAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Delete a source by id (server-only). Fails if source is system. */
export async function deleteSourceAdmin(
  sourceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not configured" };
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  if (source.isSystem) return { ok: false, error: "System sources cannot be deleted" };
  await db.collection(COLLECTION).doc(sourceId).delete();
  return { ok: true };
}

/** Update only auth-related fields for a source (server-only). */
export type SourceAuthUpdate = {
  authStatus?: string;
  lastAuthAt?: ReturnType<typeof FieldValue.serverTimestamp> | null;
  lastAuthError?: string | null;
  storageStatePath?: string | null;
};

export async function updateSourceAuthAdmin(
  sourceId: string,
  update: SourceAuthUpdate
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not configured" };
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  if (source.isSystem) return { ok: false, error: "System sources cannot be connected" };
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (update.authStatus !== undefined)
    payload.authStatus = normalizeAuthStatus(update.authStatus);
  if (update.lastAuthAt !== undefined) payload.lastAuthAt = update.lastAuthAt;
  if (update.lastAuthError !== undefined) payload.lastAuthError = update.lastAuthError;
  if (update.storageStatePath !== undefined) payload.storageStatePath = update.storageStatePath;
  await db.collection(COLLECTION).doc(sourceId).update(payload);
  return { ok: true };
}

/** Update only scan-result fields (lastScanAt, lastScanStatus, lastScanError, extraction and import counts, debug, duration). */
export type SourceScanResultUpdate = {
  lastScanAt?: ReturnType<typeof FieldValue.serverTimestamp>;
  lastScanStatus?: string;
  lastScanError?: string | null;
  lastScanExtracted?: number;
  lastScanDuplicate?: number;
  lastScanFailedExtraction?: number;
  lastScanImported?: number;
  lastScanFailedImport?: number;
  lastScanDebug?: { pageUrl?: string; pageTitle?: string; leadCardCount?: number; snippet?: string } | null;
  lastScanDurationMs?: number | null;
};

export async function updateSourceScanResultAdmin(
  sourceId: string,
  update: SourceScanResultUpdate
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not configured" };
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (update.lastScanAt !== undefined) payload.lastScanAt = update.lastScanAt;
  if (update.lastScanStatus !== undefined) payload.lastScanStatus = update.lastScanStatus;
  if (update.lastScanError !== undefined) payload.lastScanError = update.lastScanError;
  if (update.lastScanExtracted !== undefined) payload.lastScanExtracted = update.lastScanExtracted;
  if (update.lastScanDuplicate !== undefined) payload.lastScanDuplicate = update.lastScanDuplicate;
  if (update.lastScanFailedExtraction !== undefined)
    payload.lastScanFailedExtraction = update.lastScanFailedExtraction;
  if (update.lastScanImported !== undefined) payload.lastScanImported = update.lastScanImported;
  if (update.lastScanFailedImport !== undefined)
    payload.lastScanFailedImport = update.lastScanFailedImport;
  if (update.lastScanDebug !== undefined) payload.lastScanDebug = update.lastScanDebug;
  if (update.lastScanDurationMs !== undefined) payload.lastScanDurationMs = update.lastScanDurationMs;
  await db.collection(COLLECTION).doc(sourceId).update(payload);
  return { ok: true };
}

/** Update only extraction config for a source (server-only). Used after Analyze Page. */
export async function updateSourceExtractionConfigAdmin(
  sourceId: string,
  extractionConfig: SourceExtractionConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not configured" };
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  if (source.isSystem) return { ok: false, error: "System sources cannot have extraction config updated" };
  await db.collection(COLLECTION).doc(sourceId).update({
    extractionConfig,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}
