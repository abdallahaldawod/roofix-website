import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getRecentScanRunsAdmin } from "@/lib/leads/scan-runs-admin";

/** GET: recent scan runs for a source. Query: sourceId=...&limit=10 */
export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.message },
      { status: authResult.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId")?.trim();
  if (!sourceId) {
    return NextResponse.json(
      { error: "sourceId is required" },
      { status: 400 }
    );
  }

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 20) : 10;

  try {
    const runs = await getRecentScanRunsAdmin(sourceId, limit);
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load scan runs" },
      { status: 500 }
    );
  }
}
