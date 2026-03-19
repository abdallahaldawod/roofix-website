/**
 * Local always-on scanner worker.
 * Loads scannable external sources from Firestore, runs the existing background scan
 * for each in a loop with configurable delays. Thin orchestrator only; no scan logic here.
 *
 * Usage: npm run scanner-worker
 *        npx tsx scripts/scanner-worker.ts
 *
 * Requires .env.local (or env) with Firebase Admin credentials so getSourcesAdmin works.
 * Session files must exist under .auth/sources/<sourceId>/ for scannable sources.
 */

import path from "path";
import dotenv from "dotenv";

// Load .env.local first so local overrides apply when running as standalone process
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { getSourcesAdmin } from "../lib/leads/sources-admin";
import { runBackgroundScan } from "../lib/leads/scanning/background-scan-runner";
import type { LeadSource } from "../lib/leads/types";

let scanCount = 0;

// ─── Timing (single place to adjust) ─────────────────────────────────────────
const DELAY_BETWEEN_SOURCES_MS = 5_000;
/** Minimum time between the start of one scan cycle and the start of the next. No sleep if cycle took longer. */
const MIN_SCAN_INTERVAL_MS = 2_000;
const ERROR_SLEEP_BEFORE_CONTINUE_MS = 60_000;

const PREFIX = "[scanner-worker]";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Only Active sources are scanned. Paused sources are skipped so the UI Pause control stops the local scanner for that source.
 */
function getScannableSources(sources: LeadSource[]): LeadSource[] {
  return sources.filter(
    (s) =>
      !s.isSystem &&
      (s.storageStatePath?.trim() ?? "") !== "" &&
      (s.leadsUrl?.trim() ?? "") !== "" &&
      s.status === "Active"
  );
}

async function runCycle(cycleNumber: number): Promise<void> {
  const sources = await getSourcesAdmin();
  const scannable = getScannableSources(sources);

  if (scannable.length === 0) {
    const why = sources.map((s) => ({
      id: s.id,
      name: s.name?.slice(0, 20),
      status: s.status,
      hasStorage: !!(s.storageStatePath?.trim()),
      hasLeadsUrl: !!(s.leadsUrl?.trim()),
      isSystem: s.isSystem,
    }));
    console.log(`${PREFIX} no active sources, sleeping 60s (sources=${sources.length} | ${JSON.stringify(why)})`);
    await sleep(60_000);
    return;
  }

  for (const source of scannable) {
    const sourceName = source.name || source.id;
    const startMs = Date.now();
    console.log(`${PREFIX} scan #${cycleNumber} started | source=${sourceName}`);

    try {
      const result = await runBackgroundScan(source.id);
      const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

      if (result.ok) {
        const newCount = result.imported ?? 0;
        const updated = 0;
        const duplicates = result.duplicate ?? 0;
        const failed = (result.failedImport ?? 0) + (result.failedExtraction ?? 0);
        console.log(
          `${PREFIX} scan #${cycleNumber} done | source=${sourceName} | new=${newCount} | updated=${updated} | duplicates=${duplicates} | failed=${failed} | duration=${durationSec}s`
        );
      } else {
        const errMsg = (result.error ?? "Unknown error").replace(/\|/g, ";");
        console.log(
          `${PREFIX} scan #${cycleNumber} failed | source=${sourceName} | error=${errMsg} | duration=${durationSec}s`
        );
      }
    } catch (e) {
      const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
      const errMsg = (e instanceof Error ? e.message : String(e)).replace(/\|/g, ";");
      console.log(
        `${PREFIX} scan #${cycleNumber} failed | source=${sourceName} | error=${errMsg} | duration=${durationSec}s`
      );
    }
    await sleep(DELAY_BETWEEN_SOURCES_MS);
  }
}

async function main(): Promise<void> {
  console.log(`${PREFIX} worker_start`);

  for (;;) {
    scanCount++;
    const cycleStartTime = Date.now();

    try {
      console.log(`${PREFIX} ${new Date().toISOString()} scan_cycle_started { scanCount: ${scanCount} }`);
      console.log(`${PREFIX} Scanning ⟳`);
      await runCycle(scanCount);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.log(`${PREFIX} worker_error | error=${errMsg.replace(/\|/g, ";")}`);
      console.error(PREFIX, e);
      await sleep(ERROR_SLEEP_BEFORE_CONTINUE_MS);
      continue;
    }

    const cycleEndTime = Date.now();
    const durationMs = cycleEndTime - cycleStartTime;
    console.log(`${PREFIX} ${new Date().toISOString()} scan_cycle_completed { scanCount: ${scanCount} }`);

    if (durationMs >= MIN_SCAN_INTERVAL_MS) {
      console.log(`${PREFIX} ${new Date().toISOString()} next_cycle_immediate { reason: "cycle took ${durationMs}ms >= ${MIN_SCAN_INTERVAL_MS}ms" }`);
    } else {
      const sleepMs = MIN_SCAN_INTERVAL_MS - durationMs;
      console.log(`${PREFIX} ${new Date().toISOString()} loop_sleep_start { durationMs: ${sleepMs} }`);
      await sleep(sleepMs);
    }
  }
}

main();
