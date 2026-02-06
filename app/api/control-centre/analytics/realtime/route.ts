import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { fetchGa4RealtimeActiveUsers } from "@/lib/ga4-data";
import { NextRequest, NextResponse } from "next/server";

const NUMERIC_PROPERTY_ID = /^\d+$/;

const ALLOWED_ORIGINS = [
  "https://admin.roofix.com.au",
  "https://roofix.com.au",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function corsHeaders(request: NextRequest): Headers {
  const h = new Headers();
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.endsWith(".roofix.com.au"))) {
    h.set("Access-Control-Allow-Origin", origin);
  } else {
    h.set("Access-Control-Allow-Origin", "https://admin.roofix.com.au");
  }
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const auth = await requireControlCentreAuth(request);
  if (!auth.ok) {
    const res = NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
    corsHeaders(request).forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  const rawPropertyId = process.env.GA4_PROPERTY_ID?.trim();
  if (!rawPropertyId || !NUMERIC_PROPERTY_ID.test(rawPropertyId)) {
    const res = NextResponse.json(
      {
        ok: false,
        error:
          "GA4_PROPERTY_ID must be a numeric GA4 Property ID (GA Admin → Property settings → Property ID).",
      },
      { status: 500 }
    );
    corsHeaders(request).forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  const result = await fetchGa4RealtimeActiveUsers(rawPropertyId);

  if (!result.ok) {
    const res = NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.ga4Code && { ga4Code: result.ga4Code }),
        ...(result.ga4Message && { ga4Message: result.ga4Message }),
      },
      { status: 500 }
    );
    corsHeaders(request).forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  const res = NextResponse.json({
    ok: true,
    activeUsers: result.activeUsers,
  });
  corsHeaders(request).forEach((v, k) => res.headers.set(k, v));
  return res;
}
