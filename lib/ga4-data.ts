/**
 * GA4 Data API – server-side only. Uses FIREBASE_SERVICE_ACCOUNT_KEY (or KEY_PATH in dev).
 * Requires: GA4_PROPERTY_ID (numeric). Service account must have Viewer access to the GA4 property.
 * Enable "Google Analytics Data API" in Google Cloud. Never expose credentials to the client.
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { readFileSync } from "fs";
import { resolve } from "path";

export type Ga4Summary = {
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  eventCount: number;
};

export type Ga4ByDateRow = {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
};

export type Ga4TopPageRow = {
  pagePath: string;
  screenPageViews: number;
};

export type Ga4TopSourceRow = {
  sessionSource: string;
  sessionMedium: string;
  sessions: number;
};

export type Ga4EventRow = {
  eventName: string;
  eventCount: number;
};

export type Ga4Result =
  | {
      ok: true;
      summary: Ga4Summary;
      byDate: Ga4ByDateRow[];
      topPages: Ga4TopPageRow[];
      topSources: Ga4TopSourceRow[];
      events: Ga4EventRow[];
    }
  | {
      ok: false;
      error: string;
      ga4Code?: string;
      ga4Message?: string;
    };

function getServiceAccountCredentials(): { client_email: string; private_key: string } | null {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (process.env.NODE_ENV === "development" && keyPath?.trim()) {
    try {
      const resolved = resolve(process.cwd(), keyPath.trim());
      const raw = JSON.parse(readFileSync(resolved, "utf8")) as Record<string, unknown>;
      const client_email = (raw.client_email ?? raw.clientEmail) as string;
      let private_key = (raw.private_key ?? raw.privateKey) as string;
      if (private_key) private_key = private_key.replace(/\\n/g, "\n");
      if (client_email && private_key) return { client_email, private_key };
    } catch {
      // fall through
    }
  }
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson?.trim()) return null;
  try {
    const raw = JSON.parse(keyJson) as Record<string, unknown>;
    const client_email = (raw.client_email ?? raw.clientEmail) as string;
    let private_key = (raw.private_key ?? raw.privateKey) as string;
    if (private_key) private_key = private_key.replace(/\\n/g, "\n");
    if (client_email && private_key) return { client_email, private_key };
  } catch {
    return null;
  }
  return null;
}

function getGa4Client(): BetaAnalyticsDataClient | null {
  const creds = getServiceAccountCredentials();
  if (!creds) return null;
  return new BetaAnalyticsDataClient({ credentials: creds });
}

function getErrorDetails(e: unknown): { message: string; code?: string; details?: unknown } {
  const message = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
  const details =
    typeof e === "object" && e !== null && "details" in e ? (e as { details: unknown }).details : undefined;
  return { message, code, details };
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(startDate: string, endDate: string): { ok: true } | { ok: false; error: string } {
  if (!YYYY_MM_DD.test(startDate) || !YYYY_MM_DD.test(endDate)) {
    return { ok: false, error: "startDate and endDate must be YYYY-MM-DD" };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Invalid date values" };
  }
  if (end < start) {
    return { ok: false, error: "endDate must be >= startDate" };
  }
  return { ok: true };
}

export async function fetchGa4Analytics(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Ga4Result> {
  const client = getGa4Client();
  if (!client) {
    return {
      ok: false,
      error: "Missing credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY_PATH (dev).",
    };
  }

  const property = `properties/${propertyId}`;
  if (process.env.NODE_ENV === "development") {
    console.info("[GA4 Data] property:", property, "startDate:", startDate, "endDate:", endDate);
  }

  const dateRange = { startDate, endDate };
  const metricsSummary = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "screenPageViews" },
    { name: "eventCount" },
  ];

  try {
    // Run all 4 GA4 reports in parallel for faster response
    if (process.env.NODE_ENV === "development") {
      console.info("[GA4 Data] runReport: 4 reports in parallel");
    }
    const [summaryRes, pagesRes, sourcesRes, eventsRes] = await Promise.all([
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: metricsSummary,
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        limit: 15,
      }),
    ]);

    const summaryRows = (summaryRes[0]?.rows ?? []) as Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }> | null;
    }>;
    const getVal = (row: unknown, i: number): number => {
      const r = row as { metricValues?: Array<{ value?: string }> | null };
      return Number(r?.metricValues?.[i]?.value ?? 0);
    };
    const sum = (idx: number) => summaryRows.reduce((a, r) => a + getVal(r, idx), 0);
    const summary: Ga4Summary = {
      activeUsers: sum(0),
      sessions: sum(1),
      screenPageViews: sum(2),
      eventCount: sum(3),
    };

    const byDate: Ga4ByDateRow[] = summaryRows.map((row) => ({
      date: row.dimensionValues?.[0]?.value ?? "",
      activeUsers: getVal(row, 0),
      sessions: getVal(row, 1),
      screenPageViews: getVal(row, 2),
    }));

    const topPages: Ga4TopPageRow[] = (pagesRes[0]?.rows ?? []).map((row) => ({
      pagePath: row.dimensionValues?.[0]?.value ?? "",
      screenPageViews: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const topSources: Ga4TopSourceRow[] = (sourcesRes[0]?.rows ?? []).map((row) => ({
      sessionSource: row.dimensionValues?.[0]?.value ?? "",
      sessionMedium: row.dimensionValues?.[1]?.value ?? "",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const events: Ga4EventRow[] = (eventsRes[0]?.rows ?? []).map((row) => ({
      eventName: row.dimensionValues?.[0]?.value ?? "",
      eventCount: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    return {
      ok: true,
      summary,
      byDate,
      topPages,
      topSources,
      events,
    };
  } catch (e) {
    const { message, code, details } = getErrorDetails(e);
    if (process.env.NODE_ENV === "development") {
      console.warn("[GA4 Data] runReport error:", message, "code:", code, "details:", details);
    }
    return {
      ok: false,
      error: message,
      ga4Code: code,
      ga4Message: message,
    };
  }
}
