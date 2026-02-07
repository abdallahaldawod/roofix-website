import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getConversionCounts } from "@/lib/conversions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireControlCentreAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  const startDate = request.nextUrl.searchParams.get("startDate") ?? "";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json(
      { ok: false, error: "startDate and endDate required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (startDate > endDate) {
    return NextResponse.json(
      { ok: false, error: "startDate must be <= endDate" },
      { status: 400 }
    );
  }

  const counts = await getConversionCounts(startDate, endDate);
  return NextResponse.json({ ok: true, ...counts });
}
