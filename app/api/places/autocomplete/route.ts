import { NextResponse } from "next/server";
import { getGooglePlacesApiKey } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const MIN_Q = 3;
const MAX_Q = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_Q) {
    return NextResponse.json(
      { error: `Query must be at least ${MIN_Q} characters` },
      { status: 400 }
    );
  }
  if (q.length > MAX_Q) {
    return NextResponse.json(
      { error: `Query must be at most ${MAX_Q} characters` },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const key = getGooglePlacesApiKey();
  if (!key) {
    return NextResponse.json(
      { error: "Autocomplete is not configured" },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    input: q,
    key,
    components: "country:au",
  });
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return NextResponse.json(
      { error: "Autocomplete service unavailable" },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    status: string;
    predictions?: Array<{ description?: string; place_id?: string }>;
    error_message?: string;
  };

  const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    const rawMessage = data.error_message ?? `Google Places returned status: ${data.status}`;
    const isReferrerRestriction = /referr?er\s+restriction/i.test(rawMessage);
    const details = isReferrerRestriction
      ? "This API key has HTTP referrer restrictions. For server-side Places API use a key with Application restrictions set to None (or IP addresses) in Google Cloud Console → APIs & Services → Credentials."
      : rawMessage;
    console.error("[Places autocomplete] Google API error:", data.status, data.error_message ?? "");
    return NextResponse.json(
      { error: "Autocomplete request failed", details },
      { status: 502, headers: noStoreHeaders }
    );
  }

  const predictions = (data.predictions ?? []).map((p) => ({
    description: p.description ?? "",
    place_id: p.place_id ?? "",
  }));

  return NextResponse.json({ predictions }, { headers: noStoreHeaders });
}
