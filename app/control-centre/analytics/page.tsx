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
  Phone,
  Send,
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
import { getDateInSydneyOffset, getTodayInSydney } from "@/lib/sydney-date";
import { DateRangeDropdown, getRangeLabel } from "./DateRangeDropdown";

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
type Ga4DeviceRow = { deviceCategory: string; activeUsers: number };
type Ga4EventRow = { eventName: string; eventCount: number };

type ApiResponse = {
  ok: boolean;
  summary?: Ga4Summary;
  byDate?: Ga4ByDateRow[];
  topPages?: Ga4TopPageRow[];
  topSources?: Ga4TopSourceRow[];
  devices?: Ga4DeviceRow[];
  events?: Ga4EventRow[];
  error?: string;
};

/** Date as YYYY-MM-DD (used for date math; display uses Sydney via getRangeLabel). */
function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getInitialDateRange(): { startDate: string; endDate: string } {
  return {
    startDate: getDateInSydneyOffset(-7),
    endDate: getTodayInSydney(),
  };
}

/** All dates between start and end (inclusive), in GA4 format YYYYMMDD. Uses local date. */
function getDatesInRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  const out: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(formatDateYMD(d).replace(/-/g, ""));
    d.setDate(d.getDate() + 1);
  }
  return out;
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

const CACHE_KEY = "cc-analytics-cache";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function getCacheKey(startDate: string, endDate: string): string {
  return `${startDate}-${endDate}`;
}

function getCached(key: string): ApiResponse | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}-${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: ApiResponse; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS || !data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function setCached(key: string, data: ApiResponse) {
  if (typeof sessionStorage === "undefined" || !data?.ok) return;
  try {
    sessionStorage.setItem(`${CACHE_KEY}-${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ignore
  }
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState(getInitialDateRange);
  const { startDate, endDate } = dateRange;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveActiveUsers, setLiveActiveUsers] = useState<number | null>(null);
  const [liveDisplayValue, setLiveDisplayValue] = useState<number | null>(null);
  const liveAnimationRef = useRef<number | null>(null);

  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRange, setLiveRange] = useState<"1m" | "5m" | "30m">("30m");
  const liveActiveUsersRef = useRef<number | null>(null);
  const consecutiveZeroRef = useRef(0);

  const [conversionsCounts, setConversionsCounts] = useState<{
    lead_submit: number;
    call_click: number;
  } | null>(null);

  const POLL_FAST_MS = 20_000;  // when there's activity: update every 20s (feels faster)
  const POLL_SLOW_MS = 60_000; // when idle (0 users): poll every 60s (fewer requests)

  const fetchData = useCallback(async () => {
    const cacheKey = getCacheKey(startDate, endDate);
    const cached = getCached(cacheKey);
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
        setCached(cacheKey, json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      if (!hasFreshCache) setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchConversions = useCallback(async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    try {
      const res = await fetch(
        `/api/control-centre/analytics/conversions?startDate=${startDate}&endDate=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = (await res.json()) as { ok: boolean; lead_submit?: number; call_click?: number };
      if (res.ok && json.ok && typeof json.lead_submit === "number" && typeof json.call_click === "number") {
        setConversionsCounts({ lead_submit: json.lead_submit, call_click: json.call_click });
      } else {
        setConversionsCounts(null);
      }
    } catch {
      setConversionsCounts(null);
    }
  }, [startDate, endDate]);

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
      const res = await fetch(`/api/control-centre/analytics/realtime?range=${liveRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { ok: boolean; activeUsers?: number; error?: string };
      if (res.ok && json.ok && json.activeUsers != null) {
        const next = json.activeUsers;
        if (next === 0) {
          consecutiveZeroRef.current += 1;
        } else {
          consecutiveZeroRef.current = 0;
        }
        liveActiveUsersRef.current = next;
        setLiveActiveUsers(next);
        setLiveError(null);
      } else {
        const err = json.error ?? "Failed to load";
        setLiveError(
          err.includes("RESOURCE_EXHAUSTED") || err.includes("Exhausted")
            ? "GA4 quota used for this hour. Count will return within an hour."
            : err
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setLiveError(
        msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Exhausted")
          ? "GA4 quota used for this hour. Count will return within an hour."
          : msg
      );
    } finally {
      setLiveLoading(false);
    }
  }, [liveRange]);

  useEffect(() => {
    const cacheKey = getCacheKey(startDate, endDate);
    const cached = getCached(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    fetchData();
    fetchConversions();
  }, [fetchData, fetchConversions, startDate, endDate]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const isIdle = liveActiveUsersRef.current === 0 && consecutiveZeroRef.current >= 2;
      const ms = isIdle ? POLL_SLOW_MS : POLL_FAST_MS;
      timeoutId = setTimeout(() => {
        fetchLiveActiveUsers().then(scheduleNext);
      }, ms);
    };

    fetchLiveActiveUsers().then(scheduleNext);
    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [fetchLiveActiveUsers]);

  useEffect(() => {
    if (liveActiveUsers == null) {
      setLiveDisplayValue(null);
      return;
    }
    const start = liveDisplayValue ?? 0;
    const end = liveActiveUsers;
    if (start === end) {
      setLiveDisplayValue(end);
      return;
    }
    const durationMs = 500;
    const startTime = performance.now();
    const easeOutQuad = (t: number) => t * (2 - t);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = easeOutQuad(t);
      const value = Math.round(start + (end - start) * eased);
      setLiveDisplayValue(value);
      if (t < 1) {
        liveAnimationRef.current = requestAnimationFrame(tick);
      } else {
        setLiveDisplayValue(end);
        liveAnimationRef.current = null;
      }
    };
    liveAnimationRef.current = requestAnimationFrame(tick);
    return () => {
      if (liveAnimationRef.current != null) {
        cancelAnimationFrame(liveAnimationRef.current);
        liveAnimationRef.current = null;
      }
    };
  }, [liveActiveUsers]);

  const summary = data?.ok ? data.summary : undefined;
  const byDateRaw = data?.ok
    ? (data.byDate ?? [])
        .map((r) => ({ ...r, label: formatChartDate(r.date), labelLong: formatChartDateLong(r.date) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const allDates = getDatesInRange(startDate, endDate);
  const rangeLabel = getRangeLabel(startDate, endDate);
  const byDate = allDates.map((date) => {
    const row = byDateRaw.find((r) => r.date === date);
    return row ?? { date, activeUsers: 0, sessions: 0, screenPageViews: 0, label: formatChartDate(date), labelLong: formatChartDateLong(date) };
  });
  const topPages = data?.ok ? data.topPages ?? [] : [];
  const topSources = data?.ok ? data.topSources ?? [] : [];
  const devices = data?.ok ? data.devices ?? [] : [];
  const events = data?.ok ? data.events ?? [] : [];

  const formSubmissions =
    conversionsCounts?.lead_submit ?? events.find((e) => e.eventName === "lead_submit")?.eventCount ?? 0;
  const phoneCalls =
    conversionsCounts?.call_click ?? events.find((e) => e.eventName === "call_click")?.eventCount ?? 0;
  const totalConversions = formSubmissions + phoneCalls;

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-neutral-600 sm:h-9 sm:w-9">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="truncate">Website Analytics</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500">GA4 metrics from your property</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeDropdown
            startDate={startDate}
            endDate={endDate}
            onRangeChange={(range) => setDateRange({ startDate: range.startDate, endDate: range.endDate })}
          />
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

      {/* Active users = GA4 realtime, selectable range */}
      <section aria-label="Active users">
        <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Radio className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Active users
                  </span>
                  <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="mt-1 min-h-[2rem]">
                  {liveLoading ? (
                    <div className="analytics-value-skeleton h-8 w-16" aria-hidden />
                  ) : liveError ? (
                    <p className="text-sm text-amber-700" title={liveError}>
                      {liveError}
                    </p>
                  ) : (
                    <p className="tabular-nums text-xl font-bold text-neutral-900 sm:text-2xl" title={liveRange === "1m" ? "Last 1 min" : liveRange === "5m" ? "Last 5 min" : "Last 30 min"}>
                      {liveDisplayValue != null ? liveDisplayValue.toLocaleString() : "—"}
                    </p>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {liveRange === "1m" ? "Last 1 min" : liveRange === "5m" ? "Last 5 min" : "Last 30 min"}
                  {" · updates every 20–60s"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-emerald-200 bg-white p-1">
              {(["1m", "5m", "30m"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setLiveRange(r)}
                  className={`min-h-[36px] rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:py-1.5 ${
                    liveRange === r ? "bg-emerald-600 text-white" : "text-neutral-600 hover:bg-emerald-50"
                  }`}
                >
                  {r === "1m" ? "1 min" : r === "5m" ? "5 min" : "30 min"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Show dashboard whenever we have summary (stay visible during refresh); animate updates */}
      {summary && (
        <>
          {/* Conversions: form submissions + phone calls */}
          <section
            className={`transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}
            aria-label="Conversions"
          >
            <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <h2 className="text-sm font-semibold text-neutral-700">Conversions</h2>
              <p className="text-xs text-neutral-500">
                {conversionsCounts != null
                  ? "Live — updates as soon as forms are sent or calls are clicked."
                  : loading
                    ? "Loading…"
                    : "From GA4 (can take 24–48h)."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-violet-700">
                  <Send className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Form submissions</span>
                </div>
                <div className="mt-2 min-h-[2rem]">
                  {loading && conversionsCounts == null ? (
                    <div className="analytics-value-skeleton h-8 w-16" aria-hidden />
                  ) : (
                    <p className="tabular-nums text-2xl font-bold text-neutral-900">
                      {formSubmissions.toLocaleString()}
                    </p>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">Contact form sent (lead_submit)</p>
              </div>
              <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-blue-700">
                  <Phone className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Phone calls</span>
                </div>
                <div className="mt-2 min-h-[2rem]">
                  {loading && conversionsCounts == null ? (
                    <div className="analytics-value-skeleton h-8 w-16" aria-hidden />
                  ) : (
                    <p className="tabular-nums text-2xl font-bold text-neutral-900">
                      {phoneCalls.toLocaleString()}
                    </p>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">Call button clicked (call_click)</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-2 text-neutral-600">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Total conversions</span>
                </div>
                <div className="mt-2 min-h-[2rem]">
                  {loading && conversionsCounts == null ? (
                    <div className="analytics-value-skeleton h-8 w-16" aria-hidden />
                  ) : (
                    <p className="tabular-nums text-2xl font-bold text-neutral-900">
                      {totalConversions.toLocaleString()}
                    </p>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">Form + call in selected period</p>
              </div>
            </div>
          </section>

          <section
            className={`grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}
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

          <section className={`min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`} aria-label={`Active users over time, ${rangeLabel}`}>
            <div className="border-b border-neutral-100 bg-neutral-50/80 px-3 py-2 sm:px-4 sm:py-3">
              <h2 className="text-sm font-semibold text-neutral-700">
                Active users over time
                <span className="ml-2 font-normal text-neutral-500">{rangeLabel}</span>
              </h2>
            </div>
            <div className="h-56 px-2 py-3 sm:h-80 sm:px-4 sm:py-4">
              {loading ? (
                <div className="analytics-chart-skeleton h-full w-full" aria-hidden />
              ) : byDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    key={`chart-${startDate}-${endDate}-${byDate.length}`}
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
                      type="monotone"
                      dataKey="activeUsers"
                      fill="url(#activeUsersGradient)"
                      stroke="none"
                      isAnimationActive
                      animationDuration={500}
                      animationEasing="ease-out"
                      hide
                    />
                    <Line
                      type="monotone"
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

          <div className={`grid gap-4 lg:grid-cols-3 lg:gap-6 transition-opacity duration-200 ${loading ? "opacity-70" : "opacity-100"}`}>
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
                      <li key={i} className="flex min-w-0 justify-between gap-2">
                        <span className="min-w-0 truncate text-neutral-700" title={row.pagePath}>
                          {row.pagePath || "(not set)"}
                        </span>
                        <span className="shrink-0 font-medium text-neutral-900 tabular-nums">
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
                      <li key={i} className="flex min-w-0 justify-between gap-2">
                        <span className="min-w-0 truncate text-neutral-700" title={`${row.sessionSource || "(direct)"} / ${row.sessionMedium || "(none)"}`}>
                          {row.sessionSource || "(direct)"} / {row.sessionMedium || "(none)"}
                        </span>
                        <span className="shrink-0 font-medium text-neutral-900 tabular-nums">
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

            <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-700">Devices</h2>
              </div>
              <div className="max-h-64 overflow-auto p-4">
                {loading ? (
                  <ul className="space-y-2 text-sm" aria-hidden>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <li key={i} className="analytics-line-skeleton">
                        <span className="analytics-shimmer" />
                        <span className="analytics-shimmer" />
                      </li>
                    ))}
                  </ul>
                ) : devices.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {devices.map((row, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="text-neutral-700">
                          {row.deviceCategory || "(not set)"}
                        </span>
                        <span className="shrink-0 font-medium text-neutral-900">
                          {row.activeUsers.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No device data</p>
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
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 h-8 min-h-[2rem] min-w-0 overflow-hidden">
        {isLoading ? (
          <div className="analytics-value-skeleton" aria-hidden />
        ) : (
          <p
            key={value}
            className={`truncate tabular-nums text-xl font-semibold text-neutral-900 transition-all duration-300 sm:text-2xl ${
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
