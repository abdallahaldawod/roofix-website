import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";

/** POST: run manual Connect Source flow for an external lead source. */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    console.warn("[connect-source] Auth failed:", authResult.status, authResult.message);
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || !("sourceId" in body)) {
    return NextResponse.json(
      { ok: false, error: "Body must include sourceId" },
      { status: 400 }
    );
  }

  const sourceId =
    typeof (body as { sourceId: unknown }).sourceId === "string"
      ? (body as { sourceId: string }).sourceId.trim()
      : "";
  if (!sourceId) {
    return NextResponse.json(
      { ok: false, error: "sourceId is required" },
      { status: 400 }
    );
  }

  try {
    const { connectSource } = await import("@/lib/leads/connection/connect-source");
    const result = await connectSource(sourceId);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    const err = result.error;
    const status =
      err === "Source not found."
        ? 404
        : err.includes("cannot be connected") || err.includes("must have ")
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: err }, { status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Connection failed" },
      { status: 500 }
    );
  }
}
