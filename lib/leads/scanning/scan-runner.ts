/**
 * Server-only: run a read-only external scan for a lead source.
 * Launches browser, runs adapter, normalizes, dedupes, evaluates, persists.
 * No UI; no React/Next imports.
 */

import { chromium } from "playwright";
import { getAdapter } from "./adapters/registry";
import type { BrowserScanContext, AdapterAuthState } from "./adapter-types";
import { normalizeToScannedLead } from "./normalize";
import { computeDedupeKey, isLeadAlreadyProcessed } from "./dedupe";
import { processScannedLead } from "./process-scanned-lead";
import { getSourcesAdmin, incrementScanCountersAdmin } from "@/lib/leads/sources-admin";
import { getRuleSetsAdmin } from "@/lib/leads/rule-sets-admin";
import {
  writeScannedLeadRaw,
  updateScannedLeadRawActivityId,
} from "@/lib/leads/scanned-leads-admin";
import type { LeadSource, LeadRuleSet } from "@/lib/leads/types";

export type RunScanResult = {
  success: boolean;
  scanned: number;
  processed: number;
  skipped: number;
  duplicate: number;
  error?: string;
  adapterAuthState?: AdapterAuthState | null;
};

export async function runExternalScan(
  sourceId: string,
  options?: { authState?: AdapterAuthState; headless?: boolean }
): Promise<RunScanResult> {
  const result: RunScanResult = {
    success: false,
    scanned: 0,
    processed: 0,
    skipped: 0,
    duplicate: 0,
  };

  const [sources, ruleSets] = await Promise.all([
    getSourcesAdmin(),
    getRuleSetsAdmin(),
  ]);
  const source = sources.find((s) => s.id === sourceId);
  if (!source) {
    result.error = "Source not found";
    return result;
  }

  let ruleSet: LeadRuleSet | undefined;
  if (source.ruleSetId) {
    ruleSet = ruleSets.find((r) => r.id === source.ruleSetId);
  }
  if (!ruleSet) {
    ruleSet = ruleSets.find((r) => r.status === "Active");
  }
  if (!ruleSet) {
    result.error = "No rule set available for this source";
    return result;
  }

  const adapter = getAdapter(source.platform);
  if (!adapter) {
    result.error = `No adapter for platform: ${source.platform}`;
    return result;
  }

  const headless = options?.headless ?? true;
  const browser = await chromium.launch({ headless });
  try {
    const contextOptions: { storageState?: string } = {};
    if (options?.authState?.storageStatePath) {
      contextOptions.storageState = options.authState.storageStatePath;
    }
    const browserContext = await browser.newContext(contextOptions);
    const page = await browserContext.newPage();
    const scanContext: BrowserScanContext = {
      page,
      baseURL: undefined,
      storageStatePath: options?.authState?.storageStatePath,
    };

    await adapter.open(scanContext);
    await adapter.loginIfNeeded(scanContext, options?.authState);
    await adapter.navigateToList(scanContext);
    const rawLeads = await adapter.extractLeads(scanContext);
    result.scanned = rawLeads.length;

    for (const raw of rawLeads) {
      const normalized = normalizeToScannedLead(raw, source.id, source.name);
      const dedupeKey = computeDedupeKey(
        source.id,
        normalized.externalId,
        {
          title: normalized.title,
          suburb: normalized.suburb,
          postcode: normalized.postcode,
        }
      );

      if (await isLeadAlreadyProcessed(source.id, dedupeKey)) {
        result.duplicate++;
        continue;
      }

      const rawDoc = {
        sourceId: source.id,
        sourceName: source.name,
        externalId: normalized.externalId,
        dedupeKey,
        title: normalized.title,
        description: normalized.description,
        suburb: normalized.suburb,
        postcode: normalized.postcode,
        raw: normalized.raw,
      };
      const rawId = await writeScannedLeadRaw(rawDoc);
      if (!rawId) {
        result.skipped++;
        continue;
      }

      const processResult = await processScannedLead(normalized, source, ruleSet);
      if (!processResult.ok) {
        result.skipped++;
        continue;
      }

      await updateScannedLeadRawActivityId(rawId, processResult.activityId);
      await incrementScanCountersAdmin(
        source.id,
        1,
        processResult.decision === "Accept" ? 1 : 0
      );
      result.processed++;
    }

    result.success = true;
    result.adapterAuthState = options?.authState ?? null;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    await browser.close();
  }

  return result;
}
