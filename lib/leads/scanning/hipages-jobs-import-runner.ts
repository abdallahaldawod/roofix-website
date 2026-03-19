/**
 * Server-only: Hipages jobs list → hipages_jobs upsert (Playwright).
 * Shared by the import API route and the local scanner worker.
 */

import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveJobsStorageStateAbsolute } from "@/lib/leads/connection/session-persistence";
import { scanHipagesJobsListPage } from "@/lib/leads/scanning/hipages-jobs-list-scanner";
import { runHipagesJobsEnrichmentAndUpsert } from "@/lib/leads/scanning/hipages-jobs-detail-enrichment";

export type HipagesJobsImportOk = {
  ok: true;
  jobs_list_found_count: number;
  /** Rows passed to detail scrape + upsert this run (after optional cap). */
  jobs_detail_attempted_count: number;
  jobs_detail_enriched_count: number;
  jobs_saved_count: number;
  total: number;
  saved: number;
  errors: { jobId: string; message: string }[];
  /** Present when the jobs list was empty */
  message?: string;
};

export type HipagesJobsImportFail = {
  ok: false;
  error: string;
};

export type HipagesJobsImportResult = HipagesJobsImportOk | HipagesJobsImportFail;

export type RunHipagesJobsImportForSourceOptions = {
  /** Max list rows to detail-scrape and upsert this run; full list page is still scanned. */
  maxDetailJobs?: number;
};

/**
 * Sync Hipages jobs for one source: jobs list page → per-job enrichment → Firestore upserts.
 */
export async function runHipagesJobsImportForSource(
  sourceId: string,
  options?: RunHipagesJobsImportForSourceOptions
): Promise<HipagesJobsImportResult> {
  const trimmed = sourceId.trim();
  const source = await getSourceByIdAdmin(trimmed);
  if (!source) {
    return { ok: false, error: "Source not found" };
  }
  if (!source.storageStatePath?.trim()) {
    return { ok: false, error: "Source has no saved session — connect first" };
  }

  let absolutePath: string;
  try {
    absolutePath = resolveJobsStorageStateAbsolute(source);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid session path",
    };
  }

  const { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    console.log("[SESSION][JOBS] sourceId:", sourceId);
    console.log("[SESSION][JOBS] storageStatePath (relative):", source.storageStatePath);
    console.log("[SESSION][JOBS] storageStatePath (absolute):", absolutePath);
    console.log("[SESSION] Creating browser context with storageState:", absolutePath);
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    const jobRows = await scanHipagesJobsListPage(page);
    const jobs_list_found_count = jobRows.length;
    console.log(`[import-hipages-jobs] jobs_list_found_count: ${jobs_list_found_count}`);

    if (jobRows.length === 0) {
      return {
        ok: true,
        jobs_list_found_count: 0,
        jobs_detail_attempted_count: 0,
        jobs_detail_enriched_count: 0,
        jobs_saved_count: 0,
        total: 0,
        saved: 0,
        errors: [],
        message: "No jobs found on the list, or the page structure may have changed.",
      };
    }

    const maxD = options?.maxDetailJobs;
    const rowsForDetail =
      maxD != null && Number.isFinite(maxD)
        ? jobRows.slice(0, Math.max(0, Math.floor(maxD)))
        : jobRows;
    const jobs_detail_attempted_count = rowsForDetail.length;

    const result = await runHipagesJobsEnrichmentAndUpsert(page, rowsForDetail, {
      sourceId: source.id,
    });

    const jobs_saved_count = result.saved;
    const jobs_detail_enriched_count = result.jobs_detail_enriched_count;

    console.log(
      `[import-hipages-jobs] jobs_list_found_count: ${jobs_list_found_count} jobs_detail_enriched_count: ${jobs_detail_enriched_count} jobs_saved_count: ${jobs_saved_count}`
    );
    if (result.errors.length > 0) {
      console.warn(`[import-hipages-jobs] per-job errors: ${result.errors.length}`, result.errors);
    }

    return {
      ok: true,
      jobs_list_found_count,
      jobs_detail_attempted_count,
      jobs_detail_enriched_count,
      jobs_saved_count,
      total: result.totalFound,
      saved: result.saved,
      errors: result.errors,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
