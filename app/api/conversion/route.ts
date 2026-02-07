import { recordConversion } from "@/lib/conversions";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

/** POST: record a conversion (e.g. call_click from TrackedPhoneLink). Rate limited, no auth. */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`conversion:${ip}`, { windowMs: 60_000, max: 30 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { type?: string; location?: string };
  try {
    body = (await request.json()) as { type?: string; location?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body?.type === "call_click" ? "call_click" : null;
  if (!type) {
    return NextResponse.json({ error: "type must be 'call_click'" }, { status: 400 });
  }

  const location = typeof body.location === "string" ? body.location.slice(0, 100) : undefined;
  await recordConversion(type, location);
  return new NextResponse(null, { status: 204 });
}
