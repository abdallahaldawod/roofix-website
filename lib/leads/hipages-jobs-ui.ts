/**
 * Map hipages_jobs documents to LeadActivity-shaped rows for shared table / modal UI.
 */

import type { HipagesJob } from "./hipages-jobs-types";
import type { LeadActivity } from "./types";

export function hipagesJobToLeadActivity(job: HipagesJob): LeadActivity {
  return {
    id: job.id,
    title: job.title ?? "",
    description: job.fullDescription ?? job.description ?? "",
    sourceId: job.sourceId,
    sourceName: job.sourceName || "Hipages",
    suburb: job.suburb ?? "",
    postcode: job.postcode ?? undefined,
    ruleSetId: "hipages_jobs",
    matchedKeywords: [],
    excludedMatched: [],
    score: 0,
    scoreBreakdown: [],
    decision: "Accept",
    status: "Processed",
    reasons: job.jobStatus ? [job.jobStatus] : [],
    timeline: [],
    scannedAt: job.scannedAt ?? job.syncedAt ?? { seconds: 0, nanoseconds: 0 },
    customerName: job.customerName ?? undefined,
    email: job.email ?? undefined,
    phone: job.phone ?? undefined,
    serviceType: job.serviceType ?? undefined,
    postedAt: job.postedAt ?? undefined,
    postedAtIso: job.postedAtIso ?? undefined,
    postedAtText: job.postedAtText ?? undefined,
    leadCost: job.leadCost ?? undefined,
    leadCostCredits: job.leadCostCredits ?? undefined,
    attachments: job.attachments,
    jobId: job.jobId,
    externalUrl: job.href,
    canCreateQuote: job.canCreateQuote,
  };
}
