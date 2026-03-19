import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { fetchHipagesCredit } from "@/lib/leads/hipages-credit";

/** GET: Fetch hipages credit from business.hipages.com.au using connected source session. */
export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  try {
    const result = await fetchHipagesCredit();
    if (result.ok) {
      return NextResponse.json({ ok: true, credit: result.credit });
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch credit";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
