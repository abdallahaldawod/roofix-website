import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { fetchGa4RealtimeActiveUsers, type Ga4RealtimeResult, type RealtimeRange } from "@/lib/ga4-data";
import { NextRequest, NextResponse } from "next/server";

const NUMERIC_PROPERTY_ID = /^\d+$/;
const RANGE_VALUES: RealtimeRange[] = ["1m", "5m", "30m"];

/** Server-side cache: one entry per propertyId:range. Reduces GA4 API calls when client polls often. */
const REALTIME_CACHE_TTL_MS = 18_000; // 18s – client can poll every 20s and we hit GA4 at most once per 20s
const realtimeCache = new Map<
  string,
  { result: Ga4RealtimeResult; expiresAt: number }
>();

function getCachedRealtime(propertyId: string, range: RealtimeRange): Ga4RealtimeResult | null {
  const key = `${propertyId}:${range}`;
  const entry = realtimeCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.result;
}

function setCachedRealtime(propertyId: string, range: RealtimeRange, result: Ga4RealtimeResult) {
  realtimeCache.set(`${propertyId}:${range}`, {
    result,
    expiresAt: Date.now() + REALTIME_CACHE_TTL_MS,
  });
}

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

  const rangeParam = request.nextUrl.searchParams.get("range") ?? "30m";
  const range: RealtimeRange = RANGE_VALUES.includes(rangeParam as RealtimeRange) ? (rangeParam as RealtimeRange) : "30m";

  let result = getCachedRealtime(rawPropertyId, range);
  if (result === null) {
    result = await fetchGa4RealtimeActiveUsers(rawPropertyId, range);
    if (result.ok) setCachedRealtime(rawPropertyId, range, result);
  }

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
