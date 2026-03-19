/**
 * Server-only: background (headless) scan runner for connected external sources.
 * Loads saved session, opens Leads URL silently, verifies session is still valid.
 * When extractionConfig.leadCardSelector is set, extracts leads and persists to scanned_leads.
 * Uses timeouts, structured logging, scan run history, and optional debug capture.
 */

import { chromium } from "playwright";
import { FieldValue } from "firebase-admin/firestore";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { updateSourceAuthAdmin, updateSourceScanResultAdmin } from "@/lib/leads/sources-admin";
import { resolveLeadsStorageStateAbsolute } from "@/lib/leads/connection/session-persistence";
import { urlReachesLeads } from "./session-validity";
import { extractLeadsFromPage } from "./selector-extractor";
import { getAdapter, getAdapterByUrl } from "./adapters/registry";
import { normalizeToScannedLead } from "./normalize";
import { computeDedupeKey, isLeadAlreadyProcessed } from "./dedupe";
import {
  processScannedLead,
  buildPlatformUpdateFromScannedLead,
} from "./process-scanned-lead";
import {
  writeScannedLeadRaw,
  updateScannedLeadRawActivityId,
  getScannedLeadByDedupeKey,
  listScannedLeadsBySourceId,
  deleteScannedLeadRaw,
} from "@/lib/leads/scanned-leads-admin";
import { getActivityByIdAdmin, updateActivityAdmin, updateActivityRuleResultAdmin, deleteActivityById } from "@/lib/leads/activity-admin";
import { getRuleSetsAdmin } from "@/lib/leads/rule-sets-admin";
import { evaluateLead, type EvaluationInput } from "@/lib/leads/rule-engine";
import { incrementScanCountersAdmin } from "@/lib/leads/sources-admin";
import { performHipagesAction } from "@/lib/leads/hipages-action";
import { createActionRequest } from "@/lib/leads/action-queue-admin";
import { runActionQueueCycle } from "./action-queue-worker";
import type { LeadRuleSet, FsTimestamp, TriggerPlatformAction } from "@/lib/leads/types";
import type { LeadActivityPlatformUpdate } from "@/lib/leads/activity-admin";
import type { RawExtractedLead } from "./adapter-types";
import { withTimeout } from "./retry-timeout";
import { logScan } from "./scan-logger";

/** Returns true if existing activity matches the platform payload (no update needed). */
function platformDataEquals(
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

const NAVIGATION_TIMEOUT_MS = 30_000;
const BROWSER_LAUNCH_TIMEOUT_MS = 25_000;
const EXTRACTION_TIMEOUT_MS = 90_000;
/** Wait for at least one lead card to be in the DOM before extracting (SPA list may load after domcontentloaded). */
const WAIT_FOR_CARDS_MS = 18_000;

/** Used when no rule set is configured — passes all leads through as "Review" with score 0. */
const ZERO_TIMESTAMP: FsTimestamp = { seconds: 0, nanoseconds: 0 };
const PASSTHROUGH_RULE_SET: LeadRuleSet = {
  id: "none",
  name: "No Rule Set",
  description: "Passthrough — no rules configured. All leads imported as Review.",
  status: "Active",
  minScore: 0,
  requiredKeywords: [],
  excludedKeywords: [],
  scoringRules: [],
  locationFilters: [],
  thresholds: { accept: 100, review: 0, reject: Number.NEGATIVE_INFINITY },
  safetyControls: { maxLeadsPerDay: 100_000, cooldownMinutes: 0 },
  createdAt: ZERO_TIMESTAMP,
  updatedAt: ZERO_TIMESTAMP,
};

const NO_CARDS_MESSAGE =
  "No lead cards found. The list may still be loading or leadCardSelector may not match this page. Check Last run diagnostics for page URL and title.";

export type RunBackgroundScanResult =
  | {
      ok: true;
      extracted?: number;
      duplicate?: number;
      failedExtraction?: number;
      imported?: number;
      failedImport?: number;
    }
  | { ok: false; error: string; needsReconnect?: boolean };

/**
 * Run a headless background scan for the given external source: load saved session,
 * open Leads URL, verify the page is still on the leads URL (session valid).
 * If redirected to login, marks source as needs_reconnect and records scan result.
 */
export async function runBackgroundScan(
  sourceId: string
): Promise<RunBackgroundScanResult> {
  const startedAtMs = Date.now();
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found." };
  if (source.isSystem) return { ok: false, error: "System sources cannot be scanned." };

  const leadsUrl = source.leadsUrl?.trim();
  const storageStatePath = source.storageStatePath?.trim();
  if (!leadsUrl || !storageStatePath) {
    return {
      ok: false,
      error: "Source must have Leads URL and a saved session (Connect first).",
    };
  }

  logScan("scan_start", { sourceId, leadsUrl });

  let absolutePath: string;
  try {
    absolutePath = resolveLeadsStorageStateAbsolute(source);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid session path.";
    logScan("scan_failed", { sourceId, stage: "session_resolve", error: msg });
    return { ok: false, error: msg };
  }
  logScan("session_loaded", { sourceId });

  let browser;
  try {
    browser = await withTimeout(
      chromium.launch({ headless: true }),
      BROWSER_LAUNCH_TIMEOUT_MS,
      "browser_launch"
    );
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logScan("scan_failed", { sourceId, stage: "browser_launch", error: err });
    return { ok: false, error: err };
  }

  const now = FieldValue.serverTimestamp();

  try {
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    logScan("navigation_start", { sourceId });
    let navigationOk = false;
    try {
      await page.goto(leadsUrl, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      navigationOk = true;
    } catch (navErr) {
      await browser.close();
      const errMsg = navErr instanceof Error ? navErr.message : String(navErr);
      const isTimeout = /timeout|timed out/i.test(errMsg);
      const userMessage = isTimeout
        ? `Navigation timed out. If this persists, try Reconnect.`
        : errMsg;
      logScan("scan_failed", { sourceId, stage: "navigation", error: errMsg });
      await updateSourceScanResultAdmin(sourceId, {
        lastScanAt: now,
        lastScanStatus: "failed",
        lastScanError: userMessage,
        lastScanDurationMs: Date.now() - startedAtMs,
      });
      return { ok: false, error: userMessage };
    }

    const currentUrl = page.url();
    const stillLoggedIn = urlReachesLeads(currentUrl, leadsUrl);
    logScan("navigation_done", {
      sourceId,
      currentUrl,
      sessionValid: stillLoggedIn,
    });

    if (stillLoggedIn) {
      let extracted = 0;
      let duplicate = 0;
      let failedExtraction = 0;
      let imported = 0;
      let failedImport = 0;
      let lastScanDebug: { pageUrl?: string; pageTitle?: string; leadCardCount?: number; snippet?: string } | undefined;
      const config = source.extractionConfig;

      const ruleSets = await getRuleSetsAdmin();
      let ruleSet: LeadRuleSet | undefined;
      if (source.ruleSetId) {
        ruleSet = ruleSets.find((r) => r.id === source.ruleSetId);
      }
      if (!ruleSet) {
        ruleSet = ruleSets.find((r) => r.status === "Active");
      }
      // No rule set configured — use passthrough so leads still import as "Review" with score 0.
      const effectiveRuleSet = ruleSet ?? PASSTHROUGH_RULE_SET;

      // Resolve extraction path: prefer extractionConfig if set; fall back to platform adapter.
      // Try platform id first, then leadsUrl hostname (handles sources where platform="external").
      const platformAdapter = !config?.leadCardSelector
        ? (getAdapter(source.platform ?? "") ?? (leadsUrl ? getAdapterByUrl(leadsUrl) : null))
        : null;

      if (config?.leadCardSelector || platformAdapter) {
        const effectiveCardSelector = config?.leadCardSelector ?? platformAdapter?.leadCardSelector;
        try {
          logScan("wait_cards", { sourceId, selector: effectiveCardSelector ?? "(adapter)" });
          if (effectiveCardSelector) {
            try {
              await page
                .locator(effectiveCardSelector)
                .first()
                .waitFor({ state: "attached", timeout: WAIT_FOR_CARDS_MS });
            } catch {
              await browser.close();
              logScan("scan_failed", {
                sourceId,
                stage: "wait_cards",
                error: NO_CARDS_MESSAGE,
              });
              await updateSourceScanResultAdmin(sourceId, {
                lastScanAt: now,
                lastScanStatus: "failed",
                lastScanError: NO_CARDS_MESSAGE,
                lastScanDurationMs: Date.now() - startedAtMs,
              });
              return { ok: false, error: NO_CARDS_MESSAGE };
            }
          }

          let leads: RawExtractedLead[];
          let failedCountLocal = 0;
          let debugLocal: { pageUrl?: string; pageTitle?: string; leadCardCount?: number; snippet?: string } = {};

          if (platformAdapter) {
            // Count actual DOM cards before extraction so leadCardCount reflects the page, not extracted results.
            const domCardCount = effectiveCardSelector
              ? await page.locator(effectiveCardSelector).count().catch(() => 0)
              : 0;
            // Adapter-based extraction (used when source has no extractionConfig)
            leads = await withTimeout(
              platformAdapter.extractLeads({ page }),
              EXTRACTION_TIMEOUT_MS,
              "extraction"
            );
            debugLocal = {
              pageUrl: page.url(),
              pageTitle: await page.title().catch(() => ""),
              leadCardCount: domCardCount,
            };
          } else {
            // Config-based generic extraction
            const extractionPromise = extractLeadsFromPage(page, config!, {
              captureSnippet: source.extractionDebug === true,
            });
            const result = await withTimeout(
              extractionPromise,
              EXTRACTION_TIMEOUT_MS,
              "extraction"
            );
            leads = result.leads;
            failedCountLocal = result.failedCount;
            debugLocal = result.debug;
          }

          failedExtraction = failedCountLocal;
          lastScanDebug = debugLocal;

          if ((debugLocal.leadCardCount ?? 0) === 0) {
            await browser.close();
            logScan("scan_failed", {
              sourceId,
              stage: "extraction",
              cardsFound: 0,
              error: NO_CARDS_MESSAGE,
            });
            await updateSourceScanResultAdmin(sourceId, {
              lastScanAt: now,
              lastScanStatus: "failed",
              lastScanError: NO_CARDS_MESSAGE,
              lastScanDebug: debugLocal,
              lastScanDurationMs: Date.now() - startedAtMs,
            });
            return { ok: false, error: NO_CARDS_MESSAGE };
          }

          // Each new lead is written to Firestore immediately (processScannedLead → writeActivityRecordAdmin).
          // The Leads table subscribes to lead_activity via onSnapshot, so new leads appear in real time
          // while the scanner continues to the next lead without waiting for UI updates.
          const currentDedupeKeys = new Set<string>();
          for (const raw of leads) {
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
            const isProcessed = hasExisting && hasActivityId
              ? await isLeadAlreadyProcessed(source.id, dedupeKey)
              : false;

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
              // Re-apply rules on rescan: re-evaluate with current rule set and update score/decision, then trigger platform action if set.
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
                  const triggerAction = effectiveRuleSet.triggerPlatformActions?.[decisionKey] as TriggerPlatformAction | undefined;
                  const hipagesActions = normalized.raw?.hipagesActions as { accept?: string; decline?: string; waitlist?: string } | undefined;
                  // When "accept" was normalized to waitlist (Join Waitlist), use waitlist path and action "waitlist".
                  const actionPath = triggerAction && (hipagesActions?.[triggerAction] ?? (triggerAction === "accept" ? hipagesActions?.waitlist : undefined));
                  const effectiveAction: TriggerPlatformAction = (triggerAction === "accept" && actionPath === hipagesActions?.waitlist) ? "waitlist" : triggerAction!;
                  if (triggerAction && typeof actionPath === "string" && actionPath.trim().startsWith("/leads/")) {
                    try {
                      const actionResult = await triggerPlatformActionFast({
                        sourceId: source.id,
                        actionPath: actionPath.trim(),
                        action: effectiveAction,
                        leadId: activityId,
                      });
                      if (actionResult.ok) {
                        logScan("trigger_platform_action_ok", {
                          sourceId,
                          activityId,
                          decision: ruleResult.decision,
                          action: triggerAction,
                          rescan: true,
                        });
                      } else {
                        logScan("trigger_platform_action_failed", {
                          sourceId,
                          activityId,
                          decision: ruleResult.decision,
                          action: triggerAction,
                          error: actionResult.error,
                          step: actionResult.step,
                          rescan: true,
                        });
                      }
                    } catch (actionErr) {
                      logScan("trigger_platform_action_error", {
                        sourceId,
                        activityId,
                        error: actionErr instanceof Error ? actionErr.message : String(actionErr),
                        rescan: true,
                      });
                    }
                  }
                } catch (ruleErr) {
                  logScan("rescan_reapply_rules_failed", {
                    sourceId,
                    activityId,
                    error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
                  });
                }
              }
              duplicate++;
              continue;
            }

            // Re-fetch: isLeadAlreadyProcessed may have deleted the scanned_lead when the activity was missing.
            const existingForImport = await getScannedLeadByDedupeKey(source.id, dedupeKey);
            // If re-fetch returned a doc that already has an activityId, treat as duplicate (avoid creating a second activity for same lead).
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
              duplicate++;
              continue;
            }
            // Write lead_activity first so the UI sees the new lead immediately; then persist raw to scanned_leads and link.
            try {
              const processResult = await processScannedLead(
                normalized,
                source,
                effectiveRuleSet
              );
              if (!processResult.ok) {
                failedImport++;
                continue;
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
                  failedImport++;
                  continue;
                }
              }
              extracted++;
              await updateScannedLeadRawActivityId(rawId, processResult.activityId);
              await incrementScanCountersAdmin(
                source.id,
                1,
                processResult.decision === "Accept" ? 1 : 0
              );
              imported++;
              logScan("lead_imported", {
                sourceId,
                activityId: processResult.activityId,
                decision: processResult.decision,
                title: normalized.title?.slice(0, 60),
              });

              // When rule set has a trigger platform action for this decision, press the button on the platform (e.g. hipages).
              const decisionKey = processResult.decision.toLowerCase() as "accept" | "review" | "reject";
              const triggerAction = effectiveRuleSet.triggerPlatformActions?.[decisionKey] as TriggerPlatformAction | undefined;
              const hipagesActions = normalized.raw?.hipagesActions as { accept?: string; decline?: string; waitlist?: string } | undefined;
              // When "accept" was normalized to waitlist (Join Waitlist), use waitlist path and action "waitlist".
              const actionPath = triggerAction && (hipagesActions?.[triggerAction] ?? (triggerAction === "accept" ? hipagesActions?.waitlist : undefined));
              const effectiveAction: TriggerPlatformAction = (triggerAction === "accept" && actionPath === hipagesActions?.waitlist) ? "waitlist" : triggerAction!;
              if (triggerAction && typeof actionPath === "string" && actionPath.trim().startsWith("/leads/")) {
                try {
                  const actionResult = await triggerPlatformActionFast({
                    sourceId: source.id,
                    actionPath: actionPath.trim(),
                    action: effectiveAction,
                    leadId: processResult.activityId,
                  });
                  if (actionResult.ok) {
                    logScan("trigger_platform_action_ok", {
                      sourceId,
                      activityId: processResult.activityId,
                      decision: processResult.decision,
                      action: triggerAction,
                    });
                  } else {
                    logScan("trigger_platform_action_failed", {
                      sourceId,
                      activityId: processResult.activityId,
                      decision: processResult.decision,
                      action: triggerAction,
                      error: actionResult.error,
                      step: actionResult.step,
                    });
                  }
                } catch (actionErr) {
                  logScan("trigger_platform_action_error", {
                    sourceId,
                    activityId: processResult.activityId,
                    error: actionErr instanceof Error ? actionErr.message : String(actionErr),
                  });
                }
              }
            } catch (importErr) {
              failedImport++;
              logScan("import_lead_failed", {
                sourceId,
                error: importErr instanceof Error ? importErr.message : String(importErr),
              });
            }
          }

          // Remove leads that are no longer on the platform; keep leads that were accepted (they move to jobs on hipages).
          const allScanned = await listScannedLeadsBySourceId(source.id);
          for (const row of allScanned) {
            if (currentDedupeKeys.has(row.dedupeKey)) continue;
            if (row.activityId) {
              const activity = await getActivityByIdAdmin(row.activityId);
              if (activity?.platformAccepted === true) continue; // keep accepted leads on the table
              await deleteActivityById(row.activityId).catch(() => {});
            }
            await deleteScannedLeadRaw(row.id).catch(() => {});
          }

          // Cycle summary: new leads written to Firestore this run; table already updated via onSnapshot.
          logScan("import_done", {
            sourceId,
            new: imported,
            duplicates: duplicate,
            failed: failedImport,
            extracted,
          });
        } catch (extractErr) {
          await browser.close();
          const errorMessage =
            extractErr instanceof Error ? extractErr.message : String(extractErr);
          logScan("scan_failed", { sourceId, stage: "extraction", error: errorMessage });
          await updateSourceScanResultAdmin(sourceId, {
            lastScanAt: now,
            lastScanStatus: "failed",
            lastScanError: errorMessage,
            lastScanDurationMs: Date.now() - startedAtMs,
          });
          return { ok: false, error: errorMessage };
        }
      }

      await browser.close();
      const durationMs = Date.now() - startedAtMs;
      await updateSourceScanResultAdmin(sourceId, {
        lastScanAt: now,
        lastScanStatus: "success",
        lastScanError: null,
        lastScanExtracted: extracted,
        lastScanDuplicate: duplicate,
        lastScanFailedExtraction: failedExtraction,
        lastScanImported: imported,
        lastScanFailedImport: failedImport,
        lastScanDurationMs: durationMs,
        ...(lastScanDebug != null ? { lastScanDebug } : {}),
      });
      logScan("scan_done", { sourceId, status: "success" });
      return {
        ok: true,
        extracted,
        duplicate,
        failedExtraction,
        imported,
        failedImport,
      };
    }

    await browser.close();

    const message = "Session expired or redirected to login.";
    logScan("scan_failed", { sourceId, stage: "session_expired", error: message });
    await updateSourceAuthAdmin(sourceId, {
      authStatus: "needs_reconnect",
      lastAuthError: message,
    });
    await updateSourceScanResultAdmin(sourceId, {
      lastScanAt: now,
      lastScanStatus: "needs_reconnect",
      lastScanError: message,
      lastScanDurationMs: Date.now() - startedAtMs,
    });
    return { ok: false, error: message, needsReconnect: true };
  } catch (e) {
    try {
      await browser.close();
    } catch {
      //
    }
    const errorMessage = e instanceof Error ? e.message : String(e);
    logScan("scan_failed", { sourceId, stage: "run", error: errorMessage });
    await updateSourceScanResultAdmin(sourceId, {
      lastScanAt: now,
      lastScanStatus: "failed",
      lastScanError: errorMessage,
      lastScanDurationMs: Date.now() - startedAtMs,
    });
    return { ok: false, error: errorMessage };
  }
}
