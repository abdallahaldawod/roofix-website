/**
 * Single-lead ingestion from one RawExtractedLead (dedupe, Firestore, optional platform trigger).
 * Shared by the standard adapter loop and the Hipages two-pass fast/full scanner.
 */

import { normalizeToScannedLead } from "./normalize";
import { computeDedupeKey, isLeadAlreadyProcessed } from "./dedupe";
import { processScannedLead, buildPlatformUpdateFromScannedLead } from "./process-scanned-lead";
import {
  writeScannedLeadRaw,
  updateScannedLeadRawActivityId,
  getScannedLeadByDedupeKey,
} from "@/lib/leads/scanned-leads-admin";
import {
  getActivityByIdAdmin,
  updateActivityAdmin,
  updateActivityRuleResultAdmin,
} from "@/lib/leads/activity-admin";
import { evaluateLead, type EvaluationInput } from "@/lib/leads/rule-engine";
import { incrementScanCountersAdmin } from "@/lib/leads/sources-admin";
import { performHipagesAction } from "@/lib/leads/hipages-action";
import { createActionRequest } from "@/lib/leads/action-queue-admin";
import { runActionQueueCycle } from "./action-queue-worker";
import type { LeadRuleSet, LeadSource, TriggerPlatformAction } from "@/lib/leads/types";
import type { LeadActivityPlatformUpdate } from "@/lib/leads/activity-admin";
import type { RawExtractedLead } from "./adapter-types";
import { logScan } from "./scan-logger";

export type ScanLeadImportTallies = {
  duplicate: number;
  imported: number;
  failedImport: number;
  extracted: number;
};

/** Returns true if existing activity matches the platform payload (no update needed). */
export function platformDataEquals(
  payload: LeadActivityPlatformUpdate,
  existing: Record<string, unknown>
): boolean {
  const keys: (keyof LeadActivityPlatformUpdate)[] = [
    "title",
    "description",
    "suburb",
    "postcode",
    "customerName",
    "serviceType",
    "postedAt",
    "postedAtIso",
    "postedAtText",
    "leadCost",
    "leadCostCredits",
  ];
  for (const k of keys) {
    const p = payload[k];
    const e = existing[k];
    if (k === "postedAt") {
      const ps = (p as { seconds?: number } | undefined)?.seconds;
      const es =
        (e as { seconds?: number } | undefined)?.seconds ??
        (e as { _seconds?: number } | undefined)?._seconds;
      if (ps !== es) return false;
      continue;
    }
    if (p !== e && !(p == null && e == null)) return false;
  }
  const pH = payload.hipagesActions;
  const eH = existing.hipagesActions;
  if (pH != null || eH != null) {
    if (typeof pH !== "object" || typeof eH !== "object") return false;
    if (JSON.stringify(pH ?? {}) !== JSON.stringify(eH ?? {})) return false;
  }
  const pAtt = payload.attachments;
  const eAtt = existing.attachments;
  if (pAtt != null || eAtt != null) {
    if (!Array.isArray(pAtt) || !Array.isArray(eAtt) || JSON.stringify(pAtt) !== JSON.stringify(eAtt)) return false;
  }
  return true;
}

async function triggerPlatformActionFast(params: {
  sourceId: string;
  actionPath: string;
  action: TriggerPlatformAction;
  leadId: string;
}): Promise<{ ok: boolean; error?: string; step?: string }> {
  if (params.action !== "accept") {
    return performHipagesAction({
      sourceId: params.sourceId,
      actionPath: params.actionPath,
      action: params.action,
      leadId: params.leadId,
    });
  }
  const externalIdMatch = params.actionPath.match(/^\/leads\/([^/]+)\//);
  const queueId = await createActionRequest({
    leadId: params.leadId,
    sourceId: params.sourceId,
    action: "accept",
    requestedBy: "system:rule-trigger",
    ...(externalIdMatch?.[1] ? { externalId: externalIdMatch[1] } : {}),
    actionPath: params.actionPath,
  });
  if (!queueId) return { ok: false, error: "Could not queue accept action" };
  void runActionQueueCycle().catch(() => {});
  return { ok: true };
}

async function runPlatformTriggerWithOptionalFastMetrics(opts: {
  sourceId: string;
  activityId: string;
  decision: string;
  triggerAction: TriggerPlatformAction;
  actionPath: string;
  effectiveAction: TriggerPlatformAction;
  rescan?: boolean;
  fastPathActionMetrics?: boolean;
}): Promise<void> {
  const t0 = Date.now();
  try {
    const actionResult = await triggerPlatformActionFast({
      sourceId: opts.sourceId,
      actionPath: opts.actionPath.trim(),
      action: opts.effectiveAction,
      leadId: opts.activityId,
    });
    if (opts.fastPathActionMetrics) {
      logScan("fast_path_action_triggered", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        decision: opts.decision,
        action: opts.triggerAction,
        ok: actionResult.ok,
        rescan: opts.rescan === true,
      });
      logScan("fast_path_action_duration_ms", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        duration_ms: Date.now() - t0,
        decision: opts.decision,
        action: opts.triggerAction,
      });
    }
    if (actionResult.ok) {
      logScan("trigger_platform_action_ok", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        decision: opts.decision,
        action: opts.triggerAction,
        ...(opts.rescan ? { rescan: true } : {}),
      });
    } else {
      logScan("trigger_platform_action_failed", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        decision: opts.decision,
        action: opts.triggerAction,
        error: actionResult.error,
        step: actionResult.step,
        ...(opts.rescan ? { rescan: true } : {}),
      });
    }
  } catch (actionErr) {
    if (opts.fastPathActionMetrics) {
      logScan("fast_path_action_triggered", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        decision: opts.decision,
        action: opts.triggerAction,
        ok: false,
        error: actionErr instanceof Error ? actionErr.message : String(actionErr),
        rescan: opts.rescan === true,
      });
      logScan("fast_path_action_duration_ms", {
        sourceId: opts.sourceId,
        activityId: opts.activityId,
        duration_ms: Date.now() - t0,
        decision: opts.decision,
        action: opts.triggerAction,
      });
    }
    logScan("trigger_platform_action_error", {
      sourceId: opts.sourceId,
      activityId: opts.activityId,
      error: actionErr instanceof Error ? actionErr.message : String(actionErr),
      ...(opts.rescan ? { rescan: true } : {}),
    });
  }
}

/**
 * Hipages full-pass only: merge richer DOM extract into existing activity. No rule re-run, no platform trigger.
 */
export async function enrichExistingActivityFromFullExtract(opts: {
  sourceId: string;
  normalized: ReturnType<typeof normalizeToScannedLead>;
  dedupeKey: string;
}): Promise<void> {
  const { sourceId, normalized, dedupeKey } = opts;
  const existingRow = await getScannedLeadByDedupeKey(sourceId, dedupeKey);
  const activityId = existingRow?.activityId?.trim();
  if (!activityId) return;
  const activity = await getActivityByIdAdmin(activityId);
  if (!activity) return;
  const payload = buildPlatformUpdateFromScannedLead(normalized);
  if (!platformDataEquals(payload, activity)) {
    await updateActivityAdmin(activityId, payload).catch((err) => {
      logScan("update_activity_failed", {
        sourceId,
        activityId,
        error: err instanceof Error ? err.message : String(err),
        hadLeadCost: !!payload.leadCost,
        path: "hipages_full_enrich",
      });
    });
  }
}

/**
 * Process one extracted raw lead: same semantics as the original background-scan-runner loop body.
 */
export async function processOneExtractedRawLead(opts: {
  raw: RawExtractedLead;
  source: LeadSource;
  sourceId: string;
  effectiveRuleSet: LeadRuleSet;
  currentDedupeKeys: Set<string>;
  tallies: ScanLeadImportTallies;
  fastPathActionMetrics?: boolean;
}): Promise<void> {
  const { raw, source, sourceId, effectiveRuleSet, currentDedupeKeys, tallies, fastPathActionMetrics } = opts;
  const normalized = normalizeToScannedLead(raw, source.id, source.name);
  const dedupeKey = computeDedupeKey(source.id, normalized.externalId, {
    title: normalized.title,
    suburb: normalized.suburb,
    postcode: normalized.postcode,
  });

  currentDedupeKeys.add(dedupeKey);
  const existing = await getScannedLeadByDedupeKey(source.id, dedupeKey);
  const hasExisting = existing != null;
  const hasActivityId = existing?.activityId != null && existing.activityId !== "";
  const isProcessed =
    hasExisting && hasActivityId ? await isLeadAlreadyProcessed(source.id, dedupeKey) : false;

  if (existing?.activityId && isProcessed) {
    const activityId = existing.activityId;
    const activity = await getActivityByIdAdmin(activityId);
    if (activity) {
      const payload = buildPlatformUpdateFromScannedLead(normalized);
      if (!platformDataEquals(payload, activity)) {
        await updateActivityAdmin(activityId, payload).catch((err) => {
          logScan("update_activity_failed", {
            sourceId,
            activityId,
            error: err instanceof Error ? err.message : String(err),
            hadLeadCost: !!payload.leadCost,
          });
        });
      }
    }
    if (effectiveRuleSet) {
      const input: EvaluationInput = {
        title: normalized.title,
        description: normalized.description,
        suburb: normalized.suburb,
        postcode: normalized.postcode,
      };
      const ruleResult = evaluateLead(input, effectiveRuleSet);
      try {
        await updateActivityRuleResultAdmin(activityId, {
          matchedKeywords: ruleResult.matchedKeywords,
          excludedMatched: ruleResult.excludedMatched,
          score: ruleResult.score,
          scoreBreakdown: ruleResult.scoreBreakdown,
          decision: ruleResult.decision,
          reasons: ruleResult.reasons,
          timeline: ruleResult.timeline,
          status: ruleResult.status,
          ruleSetId: effectiveRuleSet.id,
        });
        const decisionKey = ruleResult.decision.toLowerCase() as "accept" | "review" | "reject";
        const triggerAction = effectiveRuleSet.triggerPlatformActions?.[decisionKey] as
          | TriggerPlatformAction
          | undefined;
        const hipagesActions = normalized.raw?.hipagesActions as
          | { accept?: string; decline?: string; waitlist?: string }
          | undefined;
        const actionPath =
          triggerAction &&
          (hipagesActions?.[triggerAction] ??
            (triggerAction === "accept" ? hipagesActions?.waitlist : undefined));
        const effectiveAction: TriggerPlatformAction =
          triggerAction === "accept" && actionPath === hipagesActions?.waitlist ? "waitlist" : triggerAction!;
        if (triggerAction && typeof actionPath === "string" && actionPath.trim().startsWith("/leads/")) {
          await runPlatformTriggerWithOptionalFastMetrics({
            sourceId,
            activityId,
            decision: ruleResult.decision,
            triggerAction,
            actionPath,
            effectiveAction,
            rescan: true,
            fastPathActionMetrics,
          });
        }
      } catch (ruleErr) {
        logScan("rescan_reapply_rules_failed", {
          sourceId,
          activityId,
          error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
        });
      }
    }
    tallies.duplicate++;
    return;
  }

  const existingForImport = await getScannedLeadByDedupeKey(source.id, dedupeKey);
  if (existingForImport?.activityId != null && existingForImport.activityId !== "") {
    const activityId = existingForImport.activityId;
    const activity = await getActivityByIdAdmin(activityId);
    if (activity) {
      const payload = buildPlatformUpdateFromScannedLead(normalized);
      if (!platformDataEquals(payload, activity)) {
        await updateActivityAdmin(activityId, payload).catch((err) => {
          logScan("update_activity_failed", {
            sourceId,
            activityId,
            error: err instanceof Error ? err.message : String(err),
            hadLeadCost: !!payload.leadCost,
            path: "re-fetch",
          });
        });
      }
    }
    if (effectiveRuleSet) {
      const input: EvaluationInput = {
        title: normalized.title,
        description: normalized.description,
        suburb: normalized.suburb,
        postcode: normalized.postcode,
      };
      const ruleResult = evaluateLead(input, effectiveRuleSet);
      try {
        await updateActivityRuleResultAdmin(activityId, {
          matchedKeywords: ruleResult.matchedKeywords,
          excludedMatched: ruleResult.excludedMatched,
          score: ruleResult.score,
          scoreBreakdown: ruleResult.scoreBreakdown,
          decision: ruleResult.decision,
          reasons: ruleResult.reasons,
          timeline: ruleResult.timeline,
          status: ruleResult.status,
          ruleSetId: effectiveRuleSet.id,
        });
      } catch (ruleErr) {
        logScan("rescan_reapply_rules_failed", {
          sourceId,
          activityId,
          error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
        });
      }
    }
    tallies.duplicate++;
    return;
  }

  try {
    const processResult = await processScannedLead(normalized, source, effectiveRuleSet);
    if (!processResult.ok) {
      tallies.failedImport++;
      return;
    }
    let rawId: string | null;
    if (existingForImport) {
      rawId = existingForImport.id;
    } else {
      rawId = await writeScannedLeadRaw({
        sourceId: source.id,
        sourceName: source.name,
        externalId: normalized.externalId,
        dedupeKey,
        title: normalized.title,
        description: normalized.description,
        suburb: normalized.suburb,
        postcode: normalized.postcode,
        raw: normalized.raw,
      });
      if (!rawId) {
        tallies.failedImport++;
        return;
      }
    }
    tallies.extracted++;
    await updateScannedLeadRawActivityId(rawId, processResult.activityId);
    await incrementScanCountersAdmin(source.id, 1, processResult.decision === "Accept" ? 1 : 0);
    tallies.imported++;
    logScan("lead_imported", {
      sourceId,
      activityId: processResult.activityId,
      decision: processResult.decision,
      title: normalized.title?.slice(0, 60),
    });

    const decisionKey = processResult.decision.toLowerCase() as "accept" | "review" | "reject";
    const triggerAction = effectiveRuleSet.triggerPlatformActions?.[decisionKey] as
      | TriggerPlatformAction
      | undefined;
    const hipagesActions = normalized.raw?.hipagesActions as
      | { accept?: string; decline?: string; waitlist?: string }
      | undefined;
    const actionPath =
      triggerAction &&
      (hipagesActions?.[triggerAction] ??
        (triggerAction === "accept" ? hipagesActions?.waitlist : undefined));
    const effectiveAction: TriggerPlatformAction =
      triggerAction === "accept" && actionPath === hipagesActions?.waitlist ? "waitlist" : triggerAction!;
    if (triggerAction && typeof actionPath === "string" && actionPath.trim().startsWith("/leads/")) {
      await runPlatformTriggerWithOptionalFastMetrics({
        sourceId,
        activityId: processResult.activityId,
        decision: processResult.decision,
        triggerAction,
        actionPath,
        effectiveAction,
        fastPathActionMetrics,
      });
    }
  } catch (importErr) {
    tallies.failedImport++;
    logScan("import_lead_failed", {
      sourceId,
      error: importErr instanceof Error ? importErr.message : String(importErr),
    });
  }
}
