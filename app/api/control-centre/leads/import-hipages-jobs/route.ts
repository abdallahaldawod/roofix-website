import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";

/**
 * POST: sync Hipages business “jobs” list into `hipages_jobs`.
 * Full Playwright list import is not wired in this repo yet; endpoint exists so the UI builds
 * and returns a clear error instead of 404.
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  void request.json().catch(() => ({}));

  return NextResponse.json(
    {
      ok: false,
      error:
        "Hipages jobs list sync is not implemented in this deployment yet. Use Firestore writes to `hipages_jobs` or add a list scraper to this route.",
    },
    { status: 501 }
  );
}
