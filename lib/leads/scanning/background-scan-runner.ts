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
import { computeDedupeKey } from "./dedupe";
import {
  listScannedLeadsBySourceId,
  deleteScannedLeadRaw,
  getScannedLeadByDedupeKey,
} from "@/lib/leads/scanned-leads-admin";
import { getActivityByIdAdmin, deleteActivityById } from "@/lib/leads/activity-admin";
import { getRuleSetsAdmin } from "@/lib/leads/rule-sets-admin";
import type { LeadRuleSet, FsTimestamp } from "@/lib/leads/types";
import type { RawExtractedLead } from "./adapter-types";
import { withTimeout } from "./retry-timeout";
import { logScan } from "./scan-logger";
import { HipagesAdapter, sortHipagesLeadCardIndicesNewestFirst } from "./adapters/hipages-adapter";
import {
  processOneExtractedRawLead,
  enrichExistingActivityFromFullExtract,
} from "./scan-lead-import-loop";

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
      const tally = {
        duplicate: 0,
        imported: 0,
        failedImport: 0,
        extracted: 0,
      };
      let failedExtraction = 0;
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

          const useHipagesTwoPass =
            platformAdapter?.platformId === "hipages" &&
            Boolean(effectiveCardSelector) &&
            platformAdapter instanceof HipagesAdapter;

          if (useHipagesTwoPass) {
            const domCardCount = await page.locator(effectiveCardSelector!).count().catch(() => 0);
            debugLocal = {
              pageUrl: page.url(),
              pageTitle: await page.title().catch(() => ""),
              leadCardCount: domCardCount,
            };
            failedCountLocal = 0;
            leads = [];
          } else if (platformAdapter) {
            const domCardCount = effectiveCardSelector
              ? await page.locator(effectiveCardSelector).count().catch(() => 0)
              : 0;
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

          const currentDedupeKeys = new Set<string>();

          if (useHipagesTwoPass) {
            const hipagesAdapter = platformAdapter as HipagesAdapter;
            const cards = await page.locator(effectiveCardSelector!).all();
            const order = await sortHipagesLeadCardIndicesNewestFirst(page, cards.length);
            const fastPathStart = Date.now();
            logScan("fast_path_started", {
              sourceId,
              cardCount: cards.length,
              ordering: "postedAt_desc",
            });
            let fastFailExtract = 0;
            for (const idx of order) {
              let raw: RawExtractedLead | null;
              try {
                raw = await withTimeout(
                  hipagesAdapter.extractLeadCard(cards[idx]!, idx, "fast"),
                  EXTRACTION_TIMEOUT_MS,
                  "hipages_fast_extraction"
                );
              } catch {
                fastFailExtract++;
                continue;
              }
              if (!raw) {
                fastFailExtract++;
                continue;
              }
              await processOneExtractedRawLead({
                raw,
                source,
                sourceId,
                effectiveRuleSet,
                currentDedupeKeys,
                tallies: tally,
                fastPathActionMetrics: true,
              });
            }
            logScan("fast_path_evaluated", {
              sourceId,
              duration_ms: Date.now() - fastPathStart,
              fast_fail_extract: fastFailExtract,
              duplicate: tally.duplicate,
              imported: tally.imported,
              extracted: tally.extracted,
              failed_import: tally.failedImport,
            });
            failedExtraction = fastFailExtract;

            const fullScanStart = Date.now();
            let fullFailExtract = 0;
            for (const idx of order) {
              let rawFull: RawExtractedLead | null;
              try {
                rawFull = await withTimeout(
                  hipagesAdapter.extractLeadCard(cards[idx]!, idx, "full"),
                  EXTRACTION_TIMEOUT_MS,
                  "hipages_full_extraction"
                );
              } catch {
                fullFailExtract++;
                continue;
              }
              if (!rawFull) {
                fullFailExtract++;
                continue;
              }
              const normalizedFull = normalizeToScannedLead(rawFull, source.id, source.name);
              const dedupeKeyFull = computeDedupeKey(source.id, normalizedFull.externalId, {
                title: normalizedFull.title,
                suburb: normalizedFull.suburb,
                postcode: normalizedFull.postcode,
              });
              currentDedupeKeys.add(dedupeKeyFull);
              const row = await getScannedLeadByDedupeKey(source.id, dedupeKeyFull);
              const aid = row?.activityId?.trim();
              if (aid) {
                await enrichExistingActivityFromFullExtract({
                  sourceId,
                  normalized: normalizedFull,
                  dedupeKey: dedupeKeyFull,
                });
              } else {
                await processOneExtractedRawLead({
                  raw: rawFull,
                  source,
                  sourceId,
                  effectiveRuleSet,
                  currentDedupeKeys,
                  tallies: tally,
                });
              }
            }
            logScan("full_scan_duration_ms", {
              sourceId,
              duration_ms: Date.now() - fullScanStart,
              full_fail_extract: fullFailExtract,
            });
            failedExtraction = fastFailExtract + fullFailExtract;
            logScan("fast_path_total_duration_ms", {
              sourceId,
              duration_ms: Date.now() - fastPathStart,
            });
          } else {
            for (const raw of leads) {
              await processOneExtractedRawLead({
                raw,
                source,
                sourceId,
                effectiveRuleSet,
                currentDedupeKeys,
                tallies: tally,
              });
            }
          }

          const allScanned = await listScannedLeadsBySourceId(source.id);
          for (const row of allScanned) {
            if (currentDedupeKeys.has(row.dedupeKey)) continue;
            if (row.activityId) {
              const activity = await getActivityByIdAdmin(row.activityId);
              if (activity?.platformAccepted === true) continue;
              await deleteActivityById(row.activityId).catch(() => {});
            }
            await deleteScannedLeadRaw(row.id).catch(() => {});
          }

          logScan("import_done", {
            sourceId,
            new: tally.imported,
            duplicates: tally.duplicate,
            failed: tally.failedImport,
            extracted: tally.extracted,
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
        lastScanExtracted: tally.extracted,
        lastScanDuplicate: tally.duplicate,
        lastScanFailedExtraction: failedExtraction,
        lastScanImported: tally.imported,
        lastScanFailedImport: tally.failedImport,
        lastScanDurationMs: durationMs,
        ...(lastScanDebug != null ? { lastScanDebug } : {}),
      });
      logScan("scan_done", {
        sourceId,
        status: "success",
        duration_ms: durationMs,
      });
      return {
        ok: true,
        extracted: tally.extracted,
        duplicate: tally.duplicate,
        failedExtraction,
        imported: tally.imported,
        failedImport: tally.failedImport,
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
