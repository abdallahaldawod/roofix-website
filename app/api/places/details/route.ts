import { NextResponse } from "next/server";
import { getGooglePlacesApiKey } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";

  if (!placeId) {
    return NextResponse.json(
      { error: "placeId is required" },
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
      { error: "Place details is not configured" },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_address,geometry",
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return NextResponse.json(
      { error: "Place details service unavailable" },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    status: string;
    result?: {
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
    };
  };

  if (data.status !== "OK" || !data.result) {
    return NextResponse.json(
      { error: "Place not found" },
      { status: 404 }
    );
  }

  const result = data.result;
  const formatted_address = result.formatted_address ?? "";
  const location = result.geometry?.location
    ? { lat: result.geometry.location.lat, lng: result.geometry.location.lng }
    : undefined;

  return NextResponse.json(
    { formatted_address, location },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
