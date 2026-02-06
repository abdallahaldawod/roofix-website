"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  BarChart3,
  RefreshCw,
  TrendingUp,
  Users,
  MousePointer,
  FileText,
  Radio,
} from "lucide-react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Ga4Summary = {
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  eventCount: number;
};

type Ga4ByDateRow = {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
};

type Ga4TopPageRow = { pagePath: string; screenPageViews: number };
type Ga4TopSourceRow = { sessionSource: string; sessionMedium: string; sessions: number };
type Ga4EventRow = { eventName: string; eventCount: number };

type ApiResponse = {
  ok: boolean;
  summary?: Ga4Summary;
  byDate?: Ga4ByDateRow[];
  topPages?: Ga4TopPageRow[];
  topSources?: Ga4TopSourceRow[];
  events?: Ga4EventRow[];
  error?: string;
};

function formatDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(preset: "7d" | "28d" | "90d"): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "28d") start.setDate(start.getDate() - 28);
  else start.setDate(start.getDate() - 90);
  return {
    startDate: formatDateYMD(start),
    endDate: formatDateYMD(end),
  };
}

/** Format YYYYMMDD for chart axis: DD/MM */
function formatChartDate(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}`;
  }
  return dateStr;
}

/** Format YYYYMMDD for tooltip: e.g. "6 Feb 2025" */
function formatChartDateLong(dateStr: string): string {
  if (dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[parseInt(m, 10) - 1] ?? m;
  const day = parseInt(d, 10);
  return `${day} ${month} ${y}`;
}

const PRESETS = [
  { label: "Last 7 days", value: "7d" as const },
  { label: "Last 28 days", value: "28d" as const },
  { label: "Last 90 days", value: "90d" as const },
];

const CACHE_KEY = "cc-analytics-cache";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function getCached(preset: string): ApiResponse | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}-${preset}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: ApiResponse; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS || !data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function setCached(preset: string, data: ApiResponse) {
  if (typeof sessionStorage === "undefined" || !data?.ok) return;
  try {
    sessionStorage.setItem(`${CACHE_KEY}-${preset}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ignore
  }
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<"7d" | "28d" | "90d">("7d");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveActiveUsers, setLiveActiveUsers] = useState<number | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const cached = getCached(preset);
    const hasFreshCache = cached !== null;
    if (!hasFreshCache) {
      setLoading(true);
    }
    setError(null);
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      setError("Sign in required");
      setLoading(false);
      return;
    }
    const token = await user.getIdToken();
    const { startDate, endDate } = getDateRange(preset);
    const url = `/api/control-centre/analytics?startDate=${startDate}&endDate=${endDate}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        setData(null);
      } else {
        setData(json);
        setCached(preset, json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      if (!hasFreshCache) setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  const fetchLiveActiveUsers = useCallback(async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      setLiveError("Sign in required");
      setLiveLoading(false);
      return;
    }
    const token = await user.getIdToken();
    try {
      const res = await fetch("/api/control-centre/analytics/realtime", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { ok: boolean; activeUsers?: number; error?: string };
      if (res.ok && json.ok && json.activeUsers != null) {
        setLiveActiveUsers(json.activeUsers);
        setLiveError(null);
      } else {
        setLiveError(json.error ?? "Failed to load");
      }
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCached(preset);
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLiveActiveUsers();
    const interval = setInterval(fetchLiveActiveUsers, 1000);
    return () => clearInterval(interval);
  }, [fetchLiveActiveUsers]);

  const summary = data?.ok ? data.summary : undefined;
  const byDate = data?.ok
    ? (data.byDate ?? [])
        .map((r) => ({ ...r, label: formatChartDate(r.date), labelLong: formatChartDateLong(r.date) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const topPages = data?.ok ? data.topPages ?? [] : [];
  const topSources = data?.ok ? data.topSources ?? [] : [];
  const events = data?.ok ? data.events ?? [] : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-200 text-neutral-600">
              <BarChart3 className="h-5 w-5" />
            </span>
            Website Analytics
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">GA4 metrics from your property</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-neutral-200 bg-white p-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreset(p.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  preset === p.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
          {error.includes("GA4_PROPERTY_ID") && (
            <p className="mt-1 text-xs">
              Set <code className="rounded bg-amber-100 px-1">GA4_PROPERTY_ID</code> (numeric) in your environment.
              Add the Firebase service account email to the GA4 property as a Viewer. Enable the Google Analytics
              Data API in Google Cloud.
            </p>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50">
          <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      )}

      {/* Active right now = GA4 realtime report filtered to current minute only (minutesAgo = 0) */}
      <section aria-label="Active right now">
        <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Radio className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Active right now
                </span>
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white animate-pulse">
                  LIVE
                </span>
              </div>
              <div className="mt-1 min-h-[2rem]">
                {liveLoading ? (
                  <div className="analytics-value-skeleton h-8 w-16" aria-hidden />
                ) : liveError ? (
                  <p className="text-sm text-amber-700">{liveError}</p>
                ) : (
                  <p className="tabular-nums text-2xl font-bold text-neutral-900" title="Active users on roofix.com.au (excludes admin) in the current minute">
                    {liveActiveUsers != null ? liveActiveUsers.toLocaleString() : "—"}
                  </p>
                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                roofix.com.au only (excludes admin) · updates every second
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Show dashboard whenever we have summary (stay visible during refresh); animate updates */}
      {summary && (
        <>
          <section
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}
            aria-label="Summary metrics"
          >
            <SummaryCard
              icon={Users}
              label="Active users"
              value={summary.activeUsers.toLocaleString()}
              isLoading={loading}
            />
            <SummaryCard
              icon={MousePointer}
              label="Sessions"
              value={summary.sessions.toLocaleString()}
              isLoading={loading}
            />
            <SummaryCard
              icon={FileText}
              label="Page views"
              value={summary.screenPageViews.toLocaleString()}
              isLoading={loading}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Events"
              value={summary.eventCount.toLocaleString()}
              isLoading={loading}
            />
          </section>

          <section className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}>
            <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-700">Active users over time</h2>
            </div>
            <div className="h-80 px-4 py-4">
              {loading ? (
                <div className="analytics-chart-skeleton h-full w-full" aria-hidden />
              ) : byDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    key={`chart-${preset}-${byDate.length}`}
                    data={byDate}
                    margin={{ top: 16, right: 16, left: 0, bottom: byDate.length > 14 ? 36 : 8 }}
                  >
                    <defs>
                      <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f172a" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eaeaea" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#737373" }}
                      axisLine={{ stroke: "#e5e5e5" }}
                      tickLine={false}
                      interval={byDate.length <= 20 ? 0 : Math.max(0, Math.floor(byDate.length / 15) - 1)}
                      angle={byDate.length > 14 ? -40 : 0}
                      textAnchor={byDate.length > 14 ? "end" : "middle"}
                      height={byDate.length > 14 ? 44 : 28}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#737373" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, "auto"]}
                      allowDecimals={false}
                      width={32}
                      tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "1px solid #e5e5e5",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        padding: "10px 14px",
                      }}
                      formatter={(value) => [(value ?? 0).toLocaleString(), "Active users"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as { labelLong?: string } | undefined;
                        return p?.labelLong ? p.labelLong : `${_}`;
                      }}
                      cursor={{ stroke: "#e5e5e5", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area
                      type="natural"
                      dataKey="activeUsers"
                      fill="url(#activeUsersGradient)"
                      stroke="none"
                      isAnimationActive
                      animationDuration={500}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="natural"
                      dataKey="activeUsers"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={{ fill: "#0f172a", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: "#fff", stroke: "#0f172a", strokeWidth: 2 }}
                      isAnimationActive
                      animationDuration={500}
                      animationEasing="ease-out"
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                  No data for this period
                </div>
              )}
            </div>
          </section>

          <div className={`grid gap-6 lg:grid-cols-2 transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}>
            <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-700">Top pages</h2>
              </div>
              <div className="max-h-64 overflow-auto p-4">
                {loading ? (
                  <ul className="space-y-2 text-sm" aria-hidden>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <li key={i} className="analytics-line-skeleton">
                        <span className="analytics-shimmer" />
                        <span className="analytics-shimmer" />
                      </li>
                    ))}
                  </ul>
                ) : topPages.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {topPages.map((row, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate text-neutral-700" title={row.pagePath}>
                          {row.pagePath || "(not set)"}
                        </span>
                        <span className="shrink-0 font-medium text-neutral-900">
                          {row.screenPageViews.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No page data</p>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-700">Top sources</h2>
              </div>
              <div className="max-h-64 overflow-auto p-4">
                {loading ? (
                  <ul className="space-y-2 text-sm" aria-hidden>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <li key={i} className="analytics-line-skeleton">
                        <span className="analytics-shimmer" />
                        <span className="analytics-shimmer" />
                      </li>
                    ))}
                  </ul>
                ) : topSources.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {topSources.map((row, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="text-neutral-700">
                          {row.sessionSource || "(direct)"} / {row.sessionMedium || "(none)"}
                        </span>
                        <span className="shrink-0 font-medium text-neutral-900">
                          {row.sessions.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No source data</p>
                )}
              </div>
            </section>
          </div>

          <section className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}>
            <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-700">Events</h2>
            </div>
            <div className="max-h-64 overflow-auto p-4">
              {loading ? (
                <ul className="space-y-2 text-sm" aria-hidden>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <li key={i} className="analytics-line-skeleton">
                      <span className="analytics-shimmer" />
                      <span className="analytics-shimmer" />
                    </li>
                  ))}
                </ul>
              ) : events.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {events.map((row, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="text-neutral-700">{row.eventName || "(not set)"}</span>
                      <span className="shrink-0 font-medium text-neutral-900">
                        {row.eventCount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">No event data</p>
              )}
            </div>
          </section>
        </>
      )}

      {!loading && !summary && !error && data && !data.ok && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-12 text-center text-sm text-neutral-500">
          No analytics data. Check GA4_PROPERTY_ID and service account access.
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  isLoading = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  isLoading?: boolean;
}) {
  const prevValue = useRef(value);
  const [animating, setAnimating] = useState(false);
  useEffect(() => {
    if (prevValue.current !== value && !isLoading) {
      prevValue.current = value;
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 400);
      return () => clearTimeout(t);
    }
    if (!isLoading) prevValue.current = value;
  }, [value, isLoading]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 h-8 min-h-[2rem]">
        {isLoading ? (
          <div className="analytics-value-skeleton" aria-hidden />
        ) : (
          <p
            key={value}
            className={`tabular-nums text-2xl font-semibold text-neutral-900 transition-all duration-300 ${
              animating ? "animate-analytics-value" : ""
            }`}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
