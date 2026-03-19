import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import { analyzePageDom } from "@/lib/leads/scanning/page-analyzer";
import { extractLeadsFromPage } from "@/lib/leads/scanning/selector-extractor";

const NAVIGATION_TIMEOUT_MS = 30_000;
const WAIT_FOR_LIST_MS = 12_000;
const PREVIEW_LEADS_LIMIT = 5;

/** POST: Analyze leads page DOM and return suggested extraction config + preview. Read-only. */
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

  const source = await getSourceByIdAdmin(sourceId);
  if (!source) {
    return NextResponse.json({ ok: false, error: "Source not found." }, { status: 404 });
  }
  if (source.isSystem) {
    return NextResponse.json(
      { ok: false, error: "System sources cannot be analyzed." },
      { status: 400 }
    );
  }
  if (source.authStatus !== "connected") {
    return NextResponse.json(
      { ok: false, error: "Source must be connected. Connect the source first, then run Analyze Page." },
      { status: 400 }
    );
  }

  const leadsUrl = source.leadsUrl?.trim();
  const storageStatePath = source.storageStatePath?.trim();
  if (!leadsUrl || !storageStatePath) {
    return NextResponse.json(
      { ok: false, error: "Source must have Leads URL and a saved session." },
      { status: 400 }
    );
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStorageStatePath(storageStatePath);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid session path." },
      { status: 400 }
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `Browser launch failed: ${err}` },
      { status: 500 }
    );
  }

  try {
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    await page.goto(leadsUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Allow SPA list to render
    await new Promise((r) => setTimeout(r, Math.min(WAIT_FOR_LIST_MS, 5000)));

    const { suggestedConfig, diagnostics } = await analyzePageDom(page);

    let previewLeads: Array<{ externalId?: string; title: string; description: string; suburb: string; postcode?: string }> = [];
    if (suggestedConfig.leadCardSelector?.trim()) {
      const result = await extractLeadsFromPage(page, suggestedConfig);
      previewLeads = result.leads.slice(0, PREVIEW_LEADS_LIMIT).map((l) => ({
        externalId: l.externalId,
        title: l.title,
        description: l.description,
        suburb: l.suburb,
        postcode: l.postcode,
      }));
      diagnostics.previewLeadCount = previewLeads.length;
    }

    await browser.close();

    return NextResponse.json({
      ok: true,
      diagnostics,
      suggestedConfig,
      previewLeads,
    });
  } catch (e) {
    await browser.close().catch(() => {});
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: err },
      { status: 500 }
    );
  }
}
