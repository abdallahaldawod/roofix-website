/**
 * Standalone Hipages jobs sync entry point for the jobs scanner worker process.
 * Uses the jobs Playwright session file via resolveJobsStorageStateAbsolute (storage-state.jobs.json per source).
 * Does not touch leads scanning or lead_activity.
 */

import { getSourcesAdmin } from "@/lib/leads/sources-admin";
import { pickFirstHipagesJobsSource } from "@/lib/leads/hipages-jobs-source-pick";
import {
  runHipagesJobsImportForSource,
  type HipagesJobsImportResult,
} from "@/lib/leads/scanning/hipages-jobs-import-runner";

const PREFIX = "[hipages-jobs-worker]";

function escPipe(s: string): string {
  return s.replace(/\|/g, ";");
}

export type ScanHipagesJobsParams = {
  sourceId?: string;
  maxDetailJobs?: number;
};

export type ScanHipagesJobsResult = HipagesJobsImportResult & { sourceId?: string };

/**
 * One jobs sync run: full jobs list scan, then detail + upsert for up to maxDetailJobs rows (hipages_jobs only).
 */
export async function scanHipagesJobs(params: ScanHipagesJobsParams = {}): Promise<ScanHipagesJobsResult> {
  const maxDetailJobs = params.maxDetailJobs;

  let sourceId = params.sourceId?.trim() ?? "";
  if (!sourceId) {
    const sources = await getSourcesAdmin();
    const picked = pickFirstHipagesJobsSource(sources);
    if (!picked) {
      const err = "No active Hipages source with session for jobs sync";
      console.log(`${PREFIX} jobs_scan_started | sourceId=none`);
      console.log(`${PREFIX} jobs_scan_failed | error=${escPipe(err)}`);
      return { ok: false, error: err };
    }
    sourceId = picked.id;
  }

  console.log(
    `${PREFIX} jobs_scan_started | sourceId=${sourceId} | maxDetailJobs=${maxDetailJobs ?? "all"}`
  );

  try {
    const result = await runHipagesJobsImportForSource(sourceId, { maxDetailJobs });

    if (!result.ok) {
      console.log(`${PREFIX} jobs_scan_failed | sourceId=${sourceId} | error=${escPipe(result.error)}`);
      return { ...result, sourceId };
    }

    console.log(`${PREFIX} jobs_found_count | count=${result.jobs_list_found_count}`);
    console.log(
      `${PREFIX} jobs_processed_count | count=${result.jobs_detail_attempted_count} | saved=${result.jobs_saved_count} | enriched=${result.jobs_detail_enriched_count}`
    );
    console.log(
      `${PREFIX} jobs_scan_completed | sourceId=${sourceId} | jobs_list_found_count=${result.jobs_list_found_count} | jobs_saved_count=${result.jobs_saved_count} | error_count=${result.errors.length}`
    );

    return { ...result, sourceId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${PREFIX} jobs_scan_failed | sourceId=${sourceId} | error=${escPipe(msg)}`);
    return { ok: false, error: msg, sourceId };
  }
}
