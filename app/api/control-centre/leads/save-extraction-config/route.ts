import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { updateSourceExtractionConfigAdmin } from "@/lib/leads/sources-admin";
import type { SourceExtractionConfig } from "@/lib/leads/types";

/** POST: Save extraction config for a source (from Analyze Page). */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
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

  if (!body || typeof body !== "object" || !("sourceId" in body) || !("extractionConfig" in body)) {
    return NextResponse.json(
      { ok: false, error: "Body must include sourceId and extractionConfig" },
      { status: 400 }
    );
  }

  const sourceId =
    typeof (body as { sourceId: unknown }).sourceId === "string"
      ? (body as { sourceId: string }).sourceId.trim()
      : "";
  const rawConfig = (body as { extractionConfig: unknown }).extractionConfig;

  if (!sourceId) {
    return NextResponse.json(
      { ok: false, error: "sourceId is required" },
      { status: 400 }
    );
  }

  if (!rawConfig || typeof rawConfig !== "object" || !("leadCardSelector" in rawConfig)) {
    return NextResponse.json(
      { ok: false, error: "extractionConfig must be an object with leadCardSelector" },
      { status: 400 }
    );
  }

  const extractionConfig: SourceExtractionConfig = stripUndefined({
    leadCardSelector: String((rawConfig as { leadCardSelector?: unknown }).leadCardSelector ?? "").trim(),
    titleSelector: trimOpt((rawConfig as { titleSelector?: unknown }).titleSelector),
    descriptionSelector: trimOpt((rawConfig as { descriptionSelector?: unknown }).descriptionSelector),
    suburbSelector: trimOpt((rawConfig as { suburbSelector?: unknown }).suburbSelector),
    postcodeSelector: trimOpt((rawConfig as { postcodeSelector?: unknown }).postcodeSelector),
    externalIdSelector: trimOpt((rawConfig as { externalIdSelector?: unknown }).externalIdSelector),
    externalIdAttribute: trimOpt((rawConfig as { externalIdAttribute?: unknown }).externalIdAttribute),
    detailLinkSelector: trimOpt((rawConfig as { detailLinkSelector?: unknown }).detailLinkSelector),
    postedAtSelector: trimOpt((rawConfig as { postedAtSelector?: unknown }).postedAtSelector),
  });

  if (!extractionConfig.leadCardSelector) {
    return NextResponse.json(
      { ok: false, error: "leadCardSelector is required" },
      { status: 400 }
    );
  }

  const result = await updateSourceExtractionConfigAdmin(sourceId, extractionConfig);
  if (!result.ok) {
    const status = result.error === "Source not found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

function trimOpt(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out as T;
}
