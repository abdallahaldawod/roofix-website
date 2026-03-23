import type { DocumentData } from "firebase/firestore";
import type { HipagesJob, HipagesJobAttachment } from "./hipages-jobs-types";
import type { FsTimestamp } from "./types";

function toFsTimestamp(v: unknown): FsTimestamp | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as { seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
  const sec = o.seconds ?? o._seconds;
  if (typeof sec !== "number" || !Number.isFinite(sec)) return undefined;
  const nano = o.nanoseconds ?? o._nanoseconds;
  return {
    seconds: sec,
    nanoseconds: typeof nano === "number" && Number.isFinite(nano) ? nano : 0,
  };
}

function mapAttachments(raw: unknown): HipagesJobAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: HipagesJobAttachment[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const url = typeof (x as { url?: string }).url === "string" ? (x as { url: string }).url.trim() : "";
    if (!url) continue;
    const label = (x as { label?: string }).label;
    out.push({
      url,
      label: typeof label === "string" && label.trim() ? label.trim() : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function docToHipagesJob(docId: string, d: DocumentData): HipagesJob {
  const jobIdRaw = d.jobId;
  return {
    id: docId,
    jobId: typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : docId,
    customerName: typeof d.customerName === "string" ? d.customerName : undefined,
    title: typeof d.title === "string" ? d.title : undefined,
    description: typeof d.description === "string" ? d.description : undefined,
    fullDescription: typeof d.fullDescription === "string" ? d.fullDescription : undefined,
    suburb: typeof d.suburb === "string" ? d.suburb : undefined,
    postcode: typeof d.postcode === "string" ? d.postcode : undefined,
    jobStatus: typeof d.jobStatus === "string" ? d.jobStatus : undefined,
    serviceType: typeof d.serviceType === "string" ? d.serviceType : undefined,
    leadCost: typeof d.leadCost === "string" ? d.leadCost : undefined,
    leadCostCredits: typeof d.leadCostCredits === "number" ? d.leadCostCredits : undefined,
    postedAt: toFsTimestamp(d.postedAt),
    postedAtIso: typeof d.postedAtIso === "string" ? d.postedAtIso : undefined,
    postedAtText: typeof d.postedAtText === "string" ? d.postedAtText : undefined,
    email: typeof d.email === "string" ? d.email : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    href: typeof d.href === "string" ? d.href : undefined,
    canCreateQuote: typeof d.canCreateQuote === "boolean" ? d.canCreateQuote : undefined,
    attachments: mapAttachments(d.attachments),
    updatedAt: toFsTimestamp(d.updatedAt),
    syncedAt: toFsTimestamp(d.syncedAt),
    createdAt: toFsTimestamp(d.createdAt),
  };
}
