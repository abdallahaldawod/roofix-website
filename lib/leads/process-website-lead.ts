/**
 * Server-only: process a website form submission into the lead pipeline.
 * Saves raw to incoming_leads (caller), resolves source/rule set, evaluates, writes to lead_activity, updates counters.
 */

import { evaluateLead, type EvaluationInput } from "./rule-engine";
import type { IncomingLeadCreate, LeadActivityCreate, LeadRuleSet } from "./types";
import { updateIncomingLeadProcessed } from "./incoming";
import { getOrCreateRoofixWebsiteSourceAdmin } from "./sources-admin";
import { getRuleSetsAdmin } from "./rule-sets-admin";
import { writeActivityRecordAdmin } from "./activity-admin";
import { incrementScanCountersAdmin } from "./sources-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";

export type ProcessWebsiteLeadPayload = {
  customerName: string;
  phone: string;
  email: string;
  suburb: string;
  postcode?: string;
  serviceType: string;
  title: string;
  description: string;
};

/**
 * Builds rule-engine EvaluationInput from form/submission payload.
 */
export function buildEvaluationInputFromForm(payload: {
  suburb: string;
  postcode?: string;
  service: string;
  projectType: string;
  message: string;
}): EvaluationInput {
  const title = `${payload.service} – ${payload.projectType}`.trim();
  const description = [payload.message, payload.service, payload.projectType]
    .filter(Boolean)
    .join(" ");
  return {
    title,
    description: description.trim() || title,
    suburb: payload.suburb.trim(),
    postcode: payload.postcode?.trim() || undefined,
  };
}

export type ProcessWebsiteLeadResult =
  | { ok: true; activityId: string }
  | { ok: false; skipped: string };

/**
 * Processes an incoming website lead: resolve source and rule set, evaluate, write to lead_activity, update counters and incoming_leads.
 * Call after writeIncomingLead; pass the returned incomingId and the same payload used for the incoming lead.
 */
export async function processWebsiteLead(
  incomingId: string,
  payload: IncomingLeadCreate
): Promise<ProcessWebsiteLeadResult> {
  const db = getAdminFirestore();
  if (!db) {
    return { ok: false, skipped: "Firestore not configured" };
  }

  const source = await getOrCreateRoofixWebsiteSourceAdmin();
  if (!source) {
    return { ok: false, skipped: "Roofix Website system source unavailable" };
  }

  let ruleSet: LeadRuleSet | undefined;
  const ruleSets = await getRuleSetsAdmin();
  if (source.ruleSetId) {
    ruleSet = ruleSets.find((r) => r.id === source.ruleSetId);
  }
  if (!ruleSet) {
    ruleSet = ruleSets.find((r) => r.status === "Active");
  }
  if (!ruleSet) {
    const fallbackTime = new Date().toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const fallbackReasons = [
      "No active rule set configured for website leads",
      "Lead queued for manual review",
    ];
    const fallbackTimeline = [
      { time: fallbackTime, event: "Lead submitted via Roofix Website form" },
      { time: fallbackTime, event: "No active rule set configured" },
      { time: fallbackTime, event: "Decision: Review (manual triage required)" },
      { time: fallbackTime, event: "Lead marked as Processed" },
    ];

    const fallbackActivity: LeadActivityCreate = {
      title: payload.title,
      description: payload.description,
      sourceId: source.id,
      sourceName: source.name,
      suburb: payload.suburb,
      postcode: payload.postcode,
      ruleSetId: source.ruleSetId || "unassigned",
      matchedKeywords: [],
      excludedMatched: [],
      score: 0,
      scoreBreakdown: [],
      decision: "Review",
      status: "Processed",
      reasons: fallbackReasons,
      timeline: fallbackTimeline,
      scannedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      customerName: payload.customerName,
      email: payload.email,
      phone: payload.phone,
      serviceType: payload.serviceType,
    };

    const fallbackActivityId = await writeActivityRecordAdmin(fallbackActivity);
    if (!fallbackActivityId) {
      return { ok: false, skipped: "Failed to write lead activity" };
    }

    await incrementScanCountersAdmin(source.id, 1, 0);
    await updateIncomingLeadProcessed(incomingId, fallbackActivityId);
    return { ok: true, activityId: fallbackActivityId };
  }

  const input: EvaluationInput = {
    title: payload.title,
    description: payload.description,
    suburb: payload.suburb,
    postcode: payload.postcode,
  };
  const result = evaluateLead(input, ruleSet);

  const scannedAtPlaceholder = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
  const activityCreate: LeadActivityCreate = {
    title: payload.title,
    description: payload.description,
    sourceId: source.id,
    sourceName: source.name,
    suburb: payload.suburb,
    postcode: payload.postcode,
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
    customerName: payload.customerName,
    email: payload.email,
    phone: payload.phone,
    serviceType: payload.serviceType,
  };

  const activityId = await writeActivityRecordAdmin(activityCreate);
  if (!activityId) {
    return { ok: false, skipped: "Failed to write lead activity" };
  }

  await incrementScanCountersAdmin(
    source.id,
    1,
    result.decision === "Accept" ? 1 : 0
  );
  await updateIncomingLeadProcessed(incomingId, activityId);

  return { ok: true, activityId };
}
