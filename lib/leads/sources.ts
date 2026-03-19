import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  increment,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { LeadSource, LeadSourceCreate, LeadSourceUpdate, SourceExtractionConfig, LastScanDebug } from "./types";
import { EXTERNAL_SCAN_METHOD, normalizeAuthStatus } from "./types";

const COLLECTION = "lead_sources";

/** Defaults for new external sources when form does not send platform/type/scanMethod/status/mode. */
const EXTERNAL_SOURCE_DEFAULTS = {
  platform: "external",
  type: "external",
  scanMethod: EXTERNAL_SCAN_METHOD,
  status: "Paused" as const,
  mode: "Manual" as const,
};

function toLeadSource(id: string, d: DocumentData): LeadSource {
  return {
    id,
    name: d.name ?? "",
    platform: d.platform ?? "",
    type: d.type ?? "",
    status: d.status ?? "Paused",
    mode: d.mode ?? "Manual",
    ruleSetId: d.ruleSetId ?? "",
    ruleSetName: d.ruleSetName ?? "",
    scanMethod: d.scanMethod ?? "",
    scanFrequency: d.scanFrequency ?? 15,
    active: d.active ?? false,
    scannedToday: d.scannedToday ?? 0,
    matchedToday: d.matchedToday ?? 0,
    lastScanAt: d.lastScanAt ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    isSystem: d.isSystem ?? false,
    loginUrl: d.loginUrl ?? undefined,
    leadsUrl: d.leadsUrl ?? undefined,
    authStatus: normalizeAuthStatus(d.authStatus),
    lastAuthAt: d.lastAuthAt ?? null,
    lastAuthError: d.lastAuthError ?? null,
    storageStatePath: d.storageStatePath ?? undefined,
    lastScanStatus: d.lastScanStatus ?? undefined,
    lastScanError: d.lastScanError ?? null,
    extractionConfig: (d.extractionConfig as SourceExtractionConfig | undefined) ?? undefined,
    lastScanExtracted: d.lastScanExtracted ?? undefined,
    lastScanDuplicate: d.lastScanDuplicate ?? undefined,
    lastScanFailedExtraction: d.lastScanFailedExtraction ?? undefined,
    lastScanImported: d.lastScanImported ?? undefined,
    lastScanFailedImport: d.lastScanFailedImport ?? undefined,
    lastScanDebug: (d.lastScanDebug as LastScanDebug | undefined) ?? undefined,
    lastScanDurationMs: typeof d.lastScanDurationMs === "number" ? d.lastScanDurationMs : undefined,
    extractionDebug: d.extractionDebug ?? undefined,
  };
}

export async function getSources(): Promise<LeadSource[]> {
  const db = getFirestoreDb();
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLeadSource(d.id, d.data()));
}

export async function createSource(data: LeadSourceCreate): Promise<string> {
  const db = getFirestoreDb();
  const payload = {
    ...EXTERNAL_SOURCE_DEFAULTS,
    ...data,
    platform: data.platform ?? EXTERNAL_SOURCE_DEFAULTS.platform,
    type: data.type ?? EXTERNAL_SOURCE_DEFAULTS.type,
    scanMethod: data.scanMethod ?? EXTERNAL_SOURCE_DEFAULTS.scanMethod,
    status: data.status ?? EXTERNAL_SOURCE_DEFAULTS.status,
    mode: data.mode ?? EXTERNAL_SOURCE_DEFAULTS.mode,
    scannedToday: 0,
    matchedToday: 0,
    lastScanAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

/** Firestore does not accept undefined; omit those keys from the update payload. */
function stripUndefined<T extends object>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function updateSource(
  id: string,
  data: LeadSourceUpdate
): Promise<void> {
  const db = getFirestoreDb();
  await updateDoc(doc(db, COLLECTION, id), stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>);
}

export async function deleteSource(id: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function pauseSource(id: string): Promise<void> {
  await updateSource(id, { status: "Paused", active: false });
}

export async function activateSource(id: string): Promise<void> {
  await updateSource(id, { status: "Active", active: true });
}

export async function incrementScanCounters(
  id: string,
  scanned: number,
  matched: number
): Promise<void> {
  const db = getFirestoreDb();
  await updateDoc(doc(db, COLLECTION, id), {
    scannedToday: increment(scanned),
    matchedToday: increment(matched),
    lastScanAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
