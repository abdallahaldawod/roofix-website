/**
 * Maps Firestore hipages_jobs documents to typed HipagesJob (client-safe).
 */

import type { DocumentData } from "firebase/firestore";
import type { HipagesJob } from "./hipages-jobs-types";
import type { FsTimestamp } from "./types";

export const HIPAGES_JOBS_COLLECTION = "hipages_jobs";
/** Max jobs loaded in UI / API list (Firestore query + sync target scale). */
export const DEFAULT_HIPAGES_JOBS_QUERY_LIMIT = 500;

function toFsTimestamp(v: unknown): FsTimestamp | undefined {
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

function normalizeAttachmentList(raw: unknown): HipagesJob["attachments"] {
  if (!Array.isArray(raw)) return undefined;
  return (raw as { url?: string; label?: string }[])
    .map((x) => ({
      url: typeof x?.url === "string" ? x.url.trim() : "",
      label: typeof x?.label === "string" ? x.label.trim() || undefined : undefined,
    }))
    .filter((x) => x.url !== "");
}

/**
 * Map a single Firestore document to HipagesJob (document id should equal jobId).
 */
export function mapFirestoreDocToHipagesJob(docId: string, d: DocumentData): HipagesJob {
  const attachmentsRaw = d.attachments ?? d.images;
  const attachments = normalizeAttachmentList(attachmentsRaw);
  return {
    id: docId,
    jobId: typeof d.jobId === "string" ? d.jobId : docId,
    href: typeof d.href === "string" ? d.href : "",
    sourceId: typeof d.sourceId === "string" ? d.sourceId : "",
    sourceName: typeof d.sourceName === "string" ? d.sourceName : "",
    customerName: d.customerName ?? null,
    suburb: d.suburb ?? null,
    postcode: d.postcode ?? null,
    title: d.title ?? null,
    description: d.description ?? null,
    fullDescription: d.fullDescription ?? null,
    serviceType: d.serviceType ?? null,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    leadCost: d.leadCost ?? null,
    leadCostCredits: d.leadCostCredits != null ? d.leadCostCredits : null,
    postedAt: d.postedAt != null ? toFsTimestamp(d.postedAt) ?? null : null,
    postedAtIso: d.postedAtIso ?? null,
    postedAtText: d.postedAtText ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    scannedAt: toFsTimestamp(d.scannedAt),
    syncedAt: toFsTimestamp(d.syncedAt),
    source: d.source === "hipages" ? "hipages" : "hipages",
    jobStatus: d.jobStatus ?? null,
    canCreateQuote: typeof d.canCreateQuote === "boolean" ? d.canCreateQuote : undefined,
  };
}
