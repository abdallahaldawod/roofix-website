/**
 * Dedicated Hipages jobs scanner worker (separate process from scripts/scanner-worker.ts).
 * Loop: scan jobs list → detail-scrape + upsert up to N jobs → sleep → repeat.
 *
 * Session: jobs-specific Playwright file `.auth/sources/<sourceId>/storage-state.jobs.json`
 * (written on Connect next to `storage-state.leads.json`; bootstrapped from leads/legacy if missing).
 *
 * Usage: npm run scanner-jobs-worker
 *        npx tsx scripts/scanner-jobs-worker.ts
 *
 * Env:
 *   HIPAGES_JOBS_WORKER_INTERVAL_MS — pause between runs (default 60000)
 *   HIPAGES_JOBS_MAX_PER_RUN — max jobs to detail-process per run after full list scan (default 8)
 *   HIPAGES_JOBS_SOURCE_ID — optional; otherwise first Active Hipages source with session is used
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { scanHipagesJobs } from "../lib/leads/scanning/hipages-jobs-worker-scan";

const PREFIX = "[hipages-jobs-worker]";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

async function main(): Promise<void> {
  const intervalMs = readPositiveInt(process.env.HIPAGES_JOBS_WORKER_INTERVAL_MS, 60_000);
  const maxDetailJobs = readNonNegativeInt(process.env.HIPAGES_JOBS_MAX_PER_RUN, 8);
  const sourceIdOpt = process.env.HIPAGES_JOBS_SOURCE_ID?.trim() || undefined;

  console.log(
    `${PREFIX} worker_start | intervalMs=${intervalMs} | maxDetailJobs=${maxDetailJobs} | sourceId=${sourceIdOpt ?? "auto"}`
  );

  for (;;) {
    try {
      await scanHipagesJobs({
        sourceId: sourceIdOpt,
        maxDetailJobs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${PREFIX} jobs_scan_failed | error=${msg.replace(/\|/g, ";")}`);
      console.error(PREFIX, e);
    }

    console.log(`${PREFIX} loop_sleep | durationMs=${intervalMs}`);
    await sleep(intervalMs);
  }
}

main();
