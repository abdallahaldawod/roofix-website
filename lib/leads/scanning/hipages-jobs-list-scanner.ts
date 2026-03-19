/**
 * Read-only scanner for the Hipages jobs list page (business.hipages.com.au/jobs?tab=list).
 * Extracts job rows only; no Firestore writes.
 */

import type { Page } from "playwright";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveJobsStorageStateAbsolute } from "@/lib/leads/connection/session-persistence";
import {
  jobsListNudgeScrollExpr,
  jobsListResetScrollExpr,
  jobsListScrollToEndExpr,
} from "@/lib/leads/scanning/hipages-jobs-list-scroll-inpage.eval";
import { getJobsListExtractJobRowsExpr } from "@/lib/leads/scanning/hipages-jobs-extract-inpage-load";

const HIPAGES_JOBS_URL = "https://business.hipages.com.au/jobs?tab=list";

export type HipagesJobListRow = {
  jobId: string;
  href: string;
  sourceName: "Hipages";
  customerName: string | null;
  suburb: string | null;
  title: string | null;
  description: string | null;
  jobStatus: string | null;
  canCreateQuote: boolean;
  /** Optional postcode only if clearly visible on list; otherwise from detail/existing data. */
  postcode?: string | null;
  /** Parsed from list card `time[datetime]` when present (detail/enquiry may still be missing). */
  postedAtFromList?: { seconds: number; nanoseconds: number } | null;
  postedAtIsoFromList?: string | null;
  postedAtTextFromList?: string | null;
  /** Visible $ or credits string on list card when enquiry scrape misses cost. */
  leadCostFromList?: string | null;
  leadCostCreditsFromList?: number | null;
};

/**
 * In-page extraction script: `hipages-jobs-extract-inpage.eval.js` (loaded as text for page.evaluate).
 * Scroll snippets: `hipages-jobs-list-scroll-inpage.eval.ts` (template literals — not transpiled inside strings).
 * Passing TS functions into evaluate can inject `__name` (bundler) into serialized code → ReferenceError in the page.
 */

export type ScanHipagesJobsListOptions = {
  /** @deprecated Prefer resolving jobs session from source via resolveJobsStorageStateAbsolute. */
  storageStatePath: string;
};

/** @deprecated Use Playwright `Page` directly; kept for typing call sites if needed. */
export type HipagesJobsListPage = Page;

function delayMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Merge two passes of the same jobId (virtualized list): keep richer text + any list-only timestamps/cost. */
export function mergeHipagesListRows(prev: HipagesJobListRow, next: HipagesJobListRow): HipagesJobListRow {
  const pickText = (a: string | null | undefined, b: string | null | undefined): string | null => {
    const ta = (a ?? "").trim();
    const tb = (b ?? "").trim();
    if (tb.length > ta.length) return tb || null;
    return ta || tb || null;
  };
  return {
    jobId: prev.jobId,
    href: prev.href || next.href,
    sourceName: "Hipages",
    customerName: pickText(prev.customerName, next.customerName),
    suburb: pickText(prev.suburb, next.suburb),
    title: pickText(prev.title, next.title),
    description: pickText(prev.description, next.description),
    jobStatus: pickText(prev.jobStatus, next.jobStatus),
    canCreateQuote: prev.canCreateQuote || next.canCreateQuote,
    postcode: prev.postcode ?? next.postcode,
    postedAtFromList: next.postedAtFromList ?? prev.postedAtFromList,
    postedAtIsoFromList: next.postedAtIsoFromList ?? prev.postedAtIsoFromList,
    postedAtTextFromList: next.postedAtTextFromList ?? prev.postedAtTextFromList,
    leadCostFromList: next.leadCostFromList ?? prev.leadCostFromList,
    leadCostCreditsFromList: next.leadCostCreditsFromList ?? prev.leadCostCreditsFromList,
  };
}

/**
 * Opens the Hipages jobs list page with the given session and extracts job rows.
 * Merges unique jobs across many small scroll steps so virtualized lists (fixed li count) still yield all jobs.
 * Read-only: no Firestore or other writes. Caller owns browser lifecycle.
 */
export async function scanHipagesJobsListPage(page: Page): Promise<HipagesJobListRow[]> {
  await page.goto(HIPAGES_JOBS_URL, { waitUntil: "load", timeout: 25_000 });
  await page.waitForSelector("main a[href*='/jobs/']", { timeout: 15_000 }).catch(() => {});
  await page.waitForSelector('ol[aria-label="Jobs list"]', { timeout: 8_000 }).catch(() => {});

  await page.evaluate(jobsListResetScrollExpr);

  await delayMs(200);

  const byId = new Map<string, HipagesJobListRow>();

  const mergeExtract = async () => {
    const rows = (await page.evaluate(getJobsListExtractJobRowsExpr())) as HipagesJobListRow[];
    for (const r of rows) {
      const existing = byId.get(r.jobId);
      if (!existing) {
        byId.set(r.jobId, r);
      } else {
        byId.set(r.jobId, mergeHipagesListRows(existing, r));
      }
    }
  };

  await mergeExtract();

  let unchanged = 0;
  let prevCount = byId.size;
  /** Stop after this many merge passes with no new jobIds (virtual + long lists). */
  const maxStalePasses = 40;
  const maxSteps = 600;

  for (let step = 0; step < maxSteps; step++) {
    await page.evaluate(jobsListNudgeScrollExpr);
    try {
      await page.mouse.wheel(0, 520);
    } catch {
      /* non-fatal */
    }
    await delayMs(90);

    await mergeExtract();

    const n = byId.size;
    if (n === prevCount) {
      unchanged++;
      if (unchanged >= maxStalePasses) break;
    } else {
      unchanged = 0;
      prevCount = n;
    }
  }

  await page.evaluate(jobsListScrollToEndExpr);
  await delayMs(200);
  await mergeExtract();

  return Array.from(byId.values());
}

/**
 * Load source, resolve storage state path, launch browser, run scan, close browser.
 * Returns job rows or empty array on failure. Throws on invalid source or path.
 */
export async function runHipagesJobsListScan(sourceId: string): Promise<HipagesJobListRow[]> {
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) throw new Error("Source not found");
  if (!source.storageStatePath?.trim()) throw new Error("Source has no saved session — connect first");
  const absolutePath = resolveJobsStorageStateAbsolute(source);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();
    return await scanHipagesJobsListPage(page);
  } finally {
    await browser.close();
  }
}
