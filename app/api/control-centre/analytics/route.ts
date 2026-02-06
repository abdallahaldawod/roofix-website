import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { fetchGa4Analytics, validateDateRange } from "@/lib/ga4-data";
import { NextRequest, NextResponse } from "next/server";

const NUMERIC_PROPERTY_ID = /^\d+$/;

export async function GET(request: NextRequest) {
  const auth = await requireControlCentreAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  const rawPropertyId = process.env.GA4_PROPERTY_ID?.trim();
  if (!rawPropertyId || !NUMERIC_PROPERTY_ID.test(rawPropertyId)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GA4_PROPERTY_ID must be a numeric GA4 Property ID (GA Admin → Property settings → Property ID).",
      },
      { status: 500 }
    );
  }

  const startDate = request.nextUrl.searchParams.get("startDate") ?? "";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "";

  const dateValidation = validateDateRange(startDate, endDate);
  if (!dateValidation.ok) {
    return NextResponse.json({ ok: false, error: dateValidation.error }, { status: 400 });
  }

  const result = await fetchGa4Analytics(rawPropertyId, startDate, endDate);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.ga4Code && { ga4Code: result.ga4Code }),
        ...(result.ga4Message && { ga4Message: result.ga4Message }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    byDate: result.byDate,
    topPages: result.topPages,
    topSources: result.topSources,
    devices: result.devices,
    events: result.events,
  });
}
