import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { clearLeadCostForHipagesLeadsWithFreeAdmin } from "@/lib/leads/activity-admin";

/**
 * POST: Clear erroneous "Free" leadCost on Hipages leads (e.g. from "free quote" in description).
 * Returns { updated: number }.
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  try {
    const updated = await clearLeadCostForHipagesLeadsWithFreeAdmin();
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    console.error("clear-free-cost:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to clear lead cost" },
      { status: 500 }
    );
  }
}
