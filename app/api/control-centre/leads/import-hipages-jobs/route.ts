import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { runHipagesJobsImportForSource } from "@/lib/leads/scanning/hipages-jobs-import-runner";

/**
 * POST: Sync Hipages jobs list → hipages_jobs collection.
 * Body: { sourceId: string }
 * Single Playwright session: jobs?tab=list → per job: detail + customer-enquiry → upsert by jobId.
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceId } = (body || {}) as Record<string, unknown>;
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const result = await runHipagesJobsImportForSource(sourceId);

  if (!result.ok) {
    const err = result.error;
    if (err === "Source not found") {
      return NextResponse.json({ ok: false, error: err }, { status: 404 });
    }
    if (
      err === "Source has no saved session — connect first" ||
      err === "Invalid session path"
    ) {
      return NextResponse.json({ ok: false, error: err }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }

  if (result.message) {
    return NextResponse.json({
      ok: true,
      jobs_list_found_count: result.jobs_list_found_count,
      jobs_detail_attempted_count: result.jobs_detail_attempted_count,
      jobs_detail_enriched_count: result.jobs_detail_enriched_count,
      jobs_saved_count: result.jobs_saved_count,
      total: result.total,
      saved: result.saved,
      errors: result.errors,
      message: result.message,
    });
  }

  return NextResponse.json({
    ok: true,
    jobs_list_found_count: result.jobs_list_found_count,
    jobs_detail_attempted_count: result.jobs_detail_attempted_count,
    jobs_detail_enriched_count: result.jobs_detail_enriched_count,
    jobs_saved_count: result.jobs_saved_count,
    total: result.total,
    saved: result.saved,
    errors: result.errors,
  });
}
