import { NextResponse } from "next/server";
import { getSourcesAdmin } from "@/lib/leads/sources-admin";
import { runBackgroundScan } from "@/lib/leads/scanning/background-scan-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.LEADS_AUTO_SCAN_SECRET;

function isAuthorized(request: Request): boolean {
  if (!CRON_SECRET || CRON_SECRET.length < 16) return false;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    return token === CRON_SECRET;
  }
  const customHeader = request.headers.get("x-cron-secret");
  if (customHeader?.trim() === CRON_SECRET) return true;
  return false;
}

/**
 * GET/POST: Run background scan for all scannable lead sources.
 * Used by Vercel Cron or an external cron service so leads are scanned
 * even when the website is closed.
 *
 * Auth: Set CRON_SECRET or LEADS_AUTO_SCAN_SECRET (min 16 chars).
 * - Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
 * - External cron: send same header or x-cron-secret.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sources = await getSourcesAdmin();
    const scannable = sources.filter(
      (s) =>
        !s.isSystem &&
        (s.storageStatePath?.trim() ?? "") !== "" &&
        s.status === "Active"
    );

    const results: { sourceId: string; sourceName: string; ok: boolean; error?: string }[] = [];
    for (const source of scannable) {
      const result = await runBackgroundScan(source.id);
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
    }

    return NextResponse.json({
      ok: true,
      scanned: scannable.length,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron scan failed";
    console.error("[cron/leads-scan]", message, e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
