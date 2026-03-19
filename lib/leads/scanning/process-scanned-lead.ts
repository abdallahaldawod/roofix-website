/**
 * Server-only: evaluate a scanned lead with the rule engine and persist to lead_activity.
 * Returns activityId; caller is responsible for updating raw scanned doc and source counters.
 */

import { evaluateLead, type EvaluationInput } from "@/lib/leads/rule-engine";
import {
  writeActivityRecordAdmin,
  type LeadActivityPlatformUpdate,
} from "@/lib/leads/activity-admin";
import type {
  ScannedLead,
  LeadSource,
  LeadRuleSet,
  LeadActivityCreate,
} from "@/lib/leads/types";

export type ProcessScannedLeadResult =
  | { ok: true; activityId: string; decision: "Accept" | "Review" | "Reject" }
  | { ok: false };

/**
 * Evaluates the lead, writes to lead_activity, and returns the activity id and decision.
 * Does not update scanned_leads or source counters; the scan runner does that.
 */
export async function processScannedLead(
  lead: ScannedLead,
  source: LeadSource,
  ruleSet: LeadRuleSet
): Promise<ProcessScannedLeadResult> {
  const input: EvaluationInput = {
    title: lead.title,
    description: lead.description,
    suburb: lead.suburb,
    postcode: lead.postcode,
  };
  const result = evaluateLead(input, ruleSet);

  const scannedAtPlaceholder = {
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  };
  // Promote optional fields stored in raw by the adapter (e.g. customerName, serviceType, postedAt from hipages)
  const customerName =
    typeof lead.raw?.customerName === "string" && lead.raw.customerName
      ? lead.raw.customerName
      : undefined;
  const serviceType =
    typeof lead.raw?.serviceType === "string" && lead.raw.serviceType
      ? lead.raw.serviceType
      : undefined;

  // Store the raw ISO string so the client can parse it in the correct local timezone.
  // Also compute seconds for server-side sorting (best-effort; display always uses postedAtIso).
  let postedAt: { seconds: number; nanoseconds: number } | undefined;
  let postedAtIso: string | undefined;
  if (typeof lead.raw?.postedAt === "string" && lead.raw.postedAt) {
    postedAtIso = lead.raw.postedAt;
    const ms = Date.parse(lead.raw.postedAt);
    if (!isNaN(ms)) {
      postedAt = { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
    }
  }

  // Also preserve the raw visible text (e.g. "Today, 6:17am") for accurate AM/PM display.
  const postedAtText =
    typeof lead.raw?.postedAtText === "string" && lead.raw.postedAtText
      ? lead.raw.postedAtText
      : undefined;

  const leadCost =
    typeof lead.raw?.leadCost === "string" && lead.raw.leadCost.trim() !== ""
      ? lead.raw.leadCost.trim()
      : null;
  const rawCredits = lead.raw?.leadCostCredits;
  const leadCostCredits =
    typeof rawCredits === "number" && Number.isFinite(rawCredits) ? rawCredits : null;

  const rawHipages = lead.raw?.hipagesActions && typeof lead.raw.hipagesActions === "object"
    ? (lead.raw.hipagesActions as {
        accept?: string;
        acceptLabel?: string;
        decline?: string;
        declineLabel?: string;
        waitlist?: string;
        waitlistLabel?: string;
      })
    : undefined;
  const hipagesActions = rawHipages
    ? {
        ...(rawHipages.accept != null && { accept: rawHipages.accept, ...(rawHipages.acceptLabel != null && { acceptLabel: rawHipages.acceptLabel }) }),
        ...(rawHipages.decline != null && { decline: rawHipages.decline, ...(rawHipages.declineLabel != null && { declineLabel: rawHipages.declineLabel }) }),
        ...(rawHipages.waitlist != null && { waitlist: rawHipages.waitlist, ...(rawHipages.waitlistLabel != null && { waitlistLabel: rawHipages.waitlistLabel }) }),
      }
    : undefined;

  const attachments = Array.isArray(lead.raw?.attachments)
    ? (lead.raw.attachments as { url?: string; label?: string }[])
        .filter((x) => x && typeof x.url === "string" && x.url.trim() !== "")
        .map((x) => ({ url: x.url!.trim(), label: typeof x.label === "string" ? x.label.trim() || undefined : undefined }))
    : undefined;

  const activityCreate: LeadActivityCreate = {
    title: lead.title,
    description: lead.description,
    sourceId: source.id,
    sourceName: source.name,
    suburb: lead.suburb,
    postcode: lead.postcode,
    ruleSetId: ruleSet.id,
    matchedKeywords: result.matchedKeywords,
    excludedMatched: result.excludedMatched,
    score: result.score,
    scoreBreakdown: result.scoreBreakdown,
    decision: result.decision,
    status: result.status,
    reasons: result.reasons,
    timeline: result.timeline,
    scannedAt: scannedAtPlaceholder,
    ...(customerName ? { customerName } : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(postedAtIso ? { postedAtIso } : {}),
    ...(postedAtText ? { postedAtText } : {}),
    leadCost: leadCost ?? null,
    leadCostCredits: leadCostCredits ?? null,
    ...(hipagesActions ? { hipagesActions } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };

  const activityId = await writeActivityRecordAdmin(activityCreate);
  if (!activityId) return { ok: false };
  // Notify admins of new lead (fire-and-forget)
  import("@/lib/push-notifications").then(({ sendPushToAdmins }) => {
    sendPushToAdmins({
      type: "new_lead",
      title: lead.title,
      activityId,
      sourceName: source.name,
    }).catch(() => {});
  });
  return { ok: true, activityId, decision: result.decision };
}

/**
 * Builds the platform-sourced fields from a ScannedLead for compare/update when re-scanning.
 */
export function buildPlatformUpdateFromScannedLead(
  lead: ScannedLead
): LeadActivityPlatformUpdate {
  const customerName =
    typeof lead.raw?.customerName === "string" && lead.raw.customerName
      ? lead.raw.customerName
      : undefined;
  const serviceType =
    typeof lead.raw?.serviceType === "string" && lead.raw.serviceType
      ? lead.raw.serviceType
      : undefined;
  let postedAt: { seconds: number; nanoseconds: number } | undefined;
  const postedAtIso =
    typeof lead.raw?.postedAt === "string" && lead.raw.postedAt
      ? lead.raw.postedAt
      : undefined;
  if (postedAtIso) {
    const ms = Date.parse(lead.raw!.postedAt as string);
    if (!isNaN(ms)) {
      postedAt = { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
    }
  }
  const postedAtText =
    typeof lead.raw?.postedAtText === "string" && lead.raw.postedAtText
      ? lead.raw.postedAtText
      : undefined;
  const leadCost =
    typeof lead.raw?.leadCost === "string" && lead.raw.leadCost.trim() !== ""
      ? lead.raw.leadCost.trim()
      : null;
  const rawCredits = lead.raw?.leadCostCredits;
  const leadCostCredits =
    typeof rawCredits === "number" && Number.isFinite(rawCredits) ? rawCredits : null;

  const hipagesActions =
    lead.raw?.hipagesActions && typeof lead.raw.hipagesActions === "object"
      ? (lead.raw.hipagesActions as Record<string, unknown>)
      : undefined;

  const attachments = Array.isArray(lead.raw?.attachments)
    ? (lead.raw.attachments as { url?: string; label?: string }[])
        .filter((x) => x && typeof x.url === "string" && x.url.trim() !== "")
        .map((x) => ({ url: x.url!.trim(), label: typeof x.label === "string" ? x.label.trim() || undefined : undefined }))
    : undefined;

  return {
    title: lead.title,
    description: lead.description,
    suburb: lead.suburb,
    postcode: lead.postcode,
    ...(customerName !== undefined ? { customerName } : {}),
    ...(serviceType !== undefined ? { serviceType } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(postedAtIso ? { postedAtIso } : {}),
    ...(postedAtText ? { postedAtText } : {}),
    leadCost: leadCost ?? null,
    leadCostCredits: leadCostCredits ?? null,
    ...(hipagesActions ? { hipagesActions } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };
}
