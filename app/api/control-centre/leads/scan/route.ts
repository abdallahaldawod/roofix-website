import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";

/** POST: run background (headless) scan for an external connected source. */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    console.warn("[leads/scan] Auth failed:", authResult.status, authResult.message);
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
    const { runBackgroundScan } = await import("@/lib/leads/scanning/background-scan-runner");
    const result = await runBackgroundScan(sourceId);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    const status =
      result.error === "Source not found."
        ? 404
        : result.error.includes("cannot be scanned") || result.error.includes("must have")
          ? 400
          : 500;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        needsReconnect: result.needsReconnect,
      },
      { status }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Scan failed",
      },
      { status: 500 }
    );
  }
}
