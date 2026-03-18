"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Eye, Loader2, AlertCircle, Settings, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useControlCentreBase } from "../use-base-path";
import { StatCard } from "./StatCard";
import { ActivityLeadModal } from "./ActivityLeadModal";
import { subscribeToActivity, deleteActivity, deleteActivities } from "@/lib/leads/activity";
import { getSources } from "@/lib/leads/sources";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { LeadActivity, LeadDecision, LeadActivityStatus } from "@/lib/leads/types";

const AUTO_SCAN_INTERVAL_MS = 10 * 1000;
const AUTO_SCAN_INITIAL_DELAY_MS = 15 * 1000;
/** How often to sync Accepted leads with hipages jobs list when viewing that tab */
const ACCEPTED_LEADS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const ACCEPTED_LEADS_SYNC_INITIAL_DELAY_MS = 3 * 1000;

const DECISION_STYLES: Record<LeadDecision, string> = {
  Accept: "bg-emerald-50 text-emerald-800",
  Review: "bg-amber-50 text-amber-800",
  Reject: "bg-red-50 text-red-800",
};

const ACTIVITY_STATUS_STYLES: Record<LeadActivityStatus, string> = {
  Scanned: "bg-neutral-100 text-neutral-600",
  Processed: "bg-emerald-50 text-emerald-800",
  Failed: "bg-red-50 text-red-800",
};

function DecisionBadge({ decision }: { decision: LeadDecision }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[decision]}`}
    >
      {decision}
    </span>
  );
}

function ActivityStatusBadge({ status }: { status: LeadActivityStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVITY_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse hipages postedAtText strings into milliseconds (local time).
 * Handles formats like:
 *   "17th Mar 2026 - 6:55 pm"
 *   "Today, 6:17am"
 *   "Yesterday, 3:00pm"
 * Returns null when the string can't be parsed (e.g. "3h ago").
 */
function parsePostedAtText(text: string): number | null {
  // Format: "17th Mar 2026 - 6:55 pm" or "17 Mar 2026 - 6:55 pm"
  const fullMatch = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s*[-–,]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (fullMatch) {
    const [, day, mon, year, hr, min, ampm] = fullMatch;
    const month = MONTH_MAP[mon!.toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    let hour = parseInt(hr!, 10);
    if (ampm!.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (ampm!.toLowerCase() === "am" && hour === 12) hour = 0;
    const d = new Date(parseInt(year!, 10), month, parseInt(day!, 10), hour, parseInt(min!, 10));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  // Format: "Today, 6:17am" / "Yesterday, 3:00pm"
  const relMatch = text.match(/^(today|yesterday)[,\s]+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (relMatch) {
    const [, rel, hr, min, ampm] = relMatch;
    const base = new Date();
    if (rel!.toLowerCase() === "yesterday") base.setDate(base.getDate() - 1);
    let hour = parseInt(hr!, 10);
    if (ampm!.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (ampm!.toLowerCase() === "am" && hour === 12) hour = 0;
    base.setHours(hour, parseInt(min!, 10), 0, 0);
    return isNaN(base.getTime()) ? null : base.getTime();
  }
  return null;
}

function formatReceivedDate(lead: LeadActivity): string {
  // Priority 1: raw visible text from the platform (e.g. "Today, 6:17pm") — exact as hipages shows it.
  if (lead.postedAtText) return lead.postedAtText;
  // Priority 2: raw ISO string parsed client-side — browser applies its own timezone, no server offset guessing.
  if (lead.postedAtIso) {
    const d = new Date(lead.postedAtIso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  }
  // Fallback: scannedAt (import time).
  const ts = lead.scannedAt;
  if (!ts) return "—";
  return new Date(ts.seconds * 1000).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatReasons(reasons: string[] | undefined): string {
  if (!reasons?.length) return "—";
  return reasons.slice(0, 2).join("; ") + (reasons.length > 2 ? "…" : "");
}

function suburbPostcode(lead: LeadActivity): string {
  const parts = [lead.suburb].filter(Boolean);
  if (lead.postcode) parts.push(lead.postcode);
  return parts.join(" / ") || "—";
}

/** Parse leadCost to a number for sorting (e.g. "$12.50" → 12.5, "30 credits" → 30). Missing/invalid → null. */
function parseLeadCostToNumber(leadCost: string | undefined): number | null {
  if (!leadCost || typeof leadCost !== "string") return null;
  const t = leadCost.trim();
  const dollar = /^\$(\d+(?:\.\d+)?)$/.exec(t);
  if (dollar) return parseFloat(dollar[1]);
  const credits = /^(\d+(?:\.\d+)?)\s+credits?$/i.exec(t);
  if (credits) return parseFloat(credits[1]);
  return null;
}

/** Posted time in ms for sorting (uses same priority as formatReceivedDate). */
function getPostedTimeMs(lead: LeadActivity): number {
  if (lead.postedAtText) {
    const ms = parsePostedAtText(lead.postedAtText);
    if (ms !== null) return ms;
  }
  if (lead.postedAtIso) {
    const ms = new Date(lead.postedAtIso).getTime();
    if (!isNaN(ms)) return ms;
  }
  if (lead.postedAt?.seconds) return lead.postedAt.seconds * 1000;
  return (lead.scannedAt?.seconds ?? 0) * 1000;
}

export type LeadsPageClientProps = { searchParams: Record<string, string | string[] | undefined> | null };

export function LeadsPageClient(props: LeadsPageClientProps) {
  const base = useControlCentreBase();
  const resolvedSearchParams = props.searchParams;
  const sourceFromUrl =
    resolvedSearchParams && "source" in resolvedSearchParams && resolvedSearchParams.source != null
      ? Array.isArray(resolvedSearchParams.source)
        ? resolvedSearchParams.source[0]
        : resolvedSearchParams.source
      : null;
  const [leads, setLeads] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [hipagesActingId, setHipagesActingId] = useState<string | null>(null);
  const [hipagesActionResult, setHipagesActionResult] = useState<Record<string, "ok" | "error">>({});
  const [fetchCustomerLeadId, setFetchCustomerLeadId] = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  /** "new" = New leads (not yet accepted on platform), "accepted" = Accepted leads (platformAccepted) */
  const [leadsTableView, setLeadsTableView] = useState<"new" | "accepted">("new");
  const [lastAcceptedSyncAt, setLastAcceptedSyncAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [lastLeadsUpdateAt, setLastLeadsUpdateAt] = useState<number | null>(null);
  const [reapplyRulesInProgress, setReapplyRulesInProgress] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [acceptedSyncInProgress, setAcceptedSyncInProgress] = useState(false);
  const acceptedSyncInProgressRef = useRef(false);

  type SortBy = "cost" | "posted";
  const [sortBy, setSortBy] = useState<SortBy>("posted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Apply ?source= from URL (e.g. from "View leads from this source")
  useEffect(() => {
    if (sourceFromUrl) setFilterSource(decodeURIComponent(sourceFromUrl));
  }, [sourceFromUrl]);

  // Realtime subscription: table updates on any add/update/delete in lead_activity.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeToActivity(
      (data) => {
        setLeads(data);
        setLastLeadsUpdateAt(Date.now());
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [retryCount]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runScans = async () => {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token || cancelled) return;
      const sources = await getSources();
      const scannable = sources.filter(
        (s) =>
          !s.isSystem &&
          s.storageStatePath &&
          (s.status === "Active" || s.authStatus === "connected")
      );
      await Promise.all(
        scannable.map((source) =>
          fetch("/api/control-centre/leads/scan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sourceId: source.id }),
          }).catch(() => {})
        )
      );
    };

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      runScans().then(() => {
        if (cancelled) return;
        intervalId = setInterval(runScans, AUTO_SCAN_INTERVAL_MS);
      });
    }, AUTO_SCAN_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, []);

  // Update "Last synced" / "Last updated" every minute so "X min ago" stays current
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const runAcceptedSync = useCallback(async () => {
    if (acceptedSyncInProgressRef.current) return;
    acceptedSyncInProgressRef.current = true;
    setAcceptedSyncInProgress(true);
    try {
      const sources = await getSources();
      const hipages = sources.filter(
        (s) => s.storageStatePath && s.name.toLowerCase().includes("hipages")
      );
      if (hipages.length === 0) {
        return;
      }
      const token = await getToken();
      const res = await fetch("/api/control-centre/leads/import-hipages-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId: hipages[0].id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) setLastAcceptedSyncAt(Date.now());
    } catch {
      /* ignore background sync errors */
    } finally {
      acceptedSyncInProgressRef.current = false;
      setAcceptedSyncInProgress(false);
    }
  }, [getToken]);

  // Auto-sync Accepted leads with hipages jobs list (runs regardless of tab so both tables stay in sync)
  useEffect(() => {
    const initialTimeoutId = window.setTimeout(runAcceptedSync, ACCEPTED_LEADS_SYNC_INITIAL_DELAY_MS);
    const intervalId = setInterval(runAcceptedSync, ACCEPTED_LEADS_SYNC_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimeoutId);
      clearInterval(intervalId);
    };
  }, [runAcceptedSync]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      await deleteActivity(id, token);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } finally {
      setDeletingId(null);
    }
  }, [getToken]);

  const handleHipagesAction = useCallback(
    async (lead: LeadActivity, action: "accept" | "decline" | "waitlist", actionPath: string) => {
      if (hipagesActingId) return;
      setHipagesActingId(`${lead.id}-${action}`);
      try {
        const token = await getToken();
        const res = await fetch("/api/control-centre/leads/hipages-action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId: lead.sourceId, actionPath, action, leadId: lead.id }),
        });
        const data = await res.json();
        setHipagesActionResult((prev) => ({ ...prev, [lead.id]: data.ok ? "ok" : "error" }));
      } catch {
        setHipagesActionResult((prev) => ({ ...prev, [lead.id]: "error" }));
      } finally {
        setHipagesActingId(null);
      }
    },
    [hipagesActingId, getToken]
  );

  const handleBulkDelete = useCallback(async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Delete ${checkedIds.size} lead${checkedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getToken();
      await deleteActivities([...checkedIds], token);
      setLeads((prev) => prev.filter((l) => !checkedIds.has(l.id)));
      setCheckedIds(new Set());
    } finally {
      setBulkDeleting(false);
    }
  }, [checkedIds, getToken]);

  const handleReapplyRules = useCallback(async () => {
    setReapplyRulesInProgress(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/control-centre/leads/reapply-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to re-apply rules");
        return;
      }
      setLastLeadsUpdateAt(Date.now());
      if (data.updated !== undefined) {
        alert(`Rules re-applied to ${data.updated} lead(s).${data.errors?.length ? ` ${data.errors.length} error(s).` : ""}`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to re-apply rules");
    } finally {
      setReapplyRulesInProgress(false);
    }
  }, [getToken]);

  const handleFetchCustomer = useCallback(
    async (leadId: string, sourceId: string): Promise<{ ok: boolean; error?: string; _debug?: Record<string, unknown> }> => {
      try {
        const token = await getToken();
        const res = await fetch("/api/control-centre/leads/fetch-hipages-job", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId, leadId }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error ?? "Request failed" };
        return { ok: data.ok === true, error: data.error, _debug: data._debug };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
      }
    },
    [getToken]
  );

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

  const totalToday = leads.length;
  const accepted = leads.filter((l) => l.decision === "Accept").length;
  const rejected = leads.filter((l) => l.decision === "Reject").length;
  const review = leads.filter((l) => l.decision === "Review").length;
  const failed = leads.filter((l) => l.status === "Failed").length;

  const leadsForView =
    leadsTableView === "accepted"
      ? leads.filter((l) => l.platformAccepted === true)
      : leads.filter((l) => l.platformAccepted !== true);

  const filtered = leadsForView.filter((lead) => {
    if (filterSource && lead.sourceName !== filterSource) return false;
    if (filterDecision && lead.decision !== filterDecision) return false;
    if (filterStatus && lead.status !== filterStatus) return false;
    if (filterDate) {
      const leadDate = lead.scannedAt
        ? new Date(lead.scannedAt.seconds * 1000).toISOString().slice(0, 10)
        : "";
      if (leadDate !== filterDate) return false;
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (
        !lead.title.toLowerCase().includes(q) &&
        !(lead.description ?? "").toLowerCase().includes(q) &&
        !lead.suburb.toLowerCase().includes(q) &&
        !lead.sourceName.toLowerCase().includes(q) &&
        !(lead.postcode ?? "").toLowerCase().includes(q) &&
        !(lead.customerName ?? "").toLowerCase().includes(q) &&
        !(lead.email ?? "").toLowerCase().includes(q) &&
        !(lead.phone ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const statusOrder: Record<string, number> = { Processed: 0, Scanned: 1, Failed: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const statusA = statusOrder[a.status] ?? 3;
    const statusB = statusOrder[b.status] ?? 3;
    if (statusA !== statusB) return statusA - statusB;
    if (sortBy === "cost") {
      const na = parseLeadCostToNumber(a.leadCost) ?? Infinity;
      const nb = parseLeadCostToNumber(b.leadCost) ?? Infinity;
      return sortDir === "asc" ? na - nb : nb - na;
    }
    const ma = getPostedTimeMs(a);
    const mb = getPostedTimeMs(b);
    return sortDir === "asc" ? ma - mb : mb - ma;
  });

  const handleSortCost = () => {
    if (sortBy === "cost") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy("cost");
      setSortDir("asc"); // cheapest first
    }
  };
  const handleSortPosted = () => {
    if (sortBy === "posted") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy("posted");
      setSortDir("desc"); // newest first by default
    }
  };

  const allVisibleIds = sorted.map((l) => l.id);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => checkedIds.has(id));
  const someChecked = !allChecked && allVisibleIds.some((id) => checkedIds.has(id));

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setCheckedIds((prev) => new Set([...prev, ...allVisibleIds]));
    }
  };

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const uniqueSources = Array.from(new Set(leads.map((l) => l.sourceName)));
  const selectClass =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading leads...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-16 shadow-sm">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setLoading(true);
            setRetryCount((c) => c + 1);
          }}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <header className="border-b border-neutral-200 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Leads
            </h1>
            <p className="mt-2 text-neutral-600 sm:text-base">
              Your lead inbox from all sources
            </p>
          </div>
          <Link
            href={(base || "/control-centre") + "/leads/management"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
          >
            <Settings className="h-4 w-4" />
            Lead Management
          </Link>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Leads Today" value={totalToday} />
        <StatCard title="Accepted" value={accepted} />
        <StatCard title="Rejected" value={rejected} />
        <StatCard title="Review" value={review} />
        <StatCard title="Failed" value={failed} />
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className={selectClass}
            >
              <option value="">All Sources</option>
              {uniqueSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Decision</label>
            <select
              value={filterDecision}
              onChange={(e) => setFilterDecision(e.target.value)}
              className={selectClass}
            >
              <option value="">All Decisions</option>
              <option value="Accept">Accept</option>
              <option value="Review">Review</option>
              <option value="Reject">Reject</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={selectClass}
            >
              <option value="">All Statuses</option>
              <option value="Scanned">Scanned</option>
              <option value="Processed">Processed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">From</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className={selectClass}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table view tabs: New leads | Accepted leads + Import */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => setLeadsTableView("new")}
            className={`min-h-[40px] flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none sm:px-6 ${
              leadsTableView === "new"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            New leads
          </button>
          <button
            type="button"
            onClick={() => setLeadsTableView("accepted")}
            className={`min-h-[40px] flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none sm:px-6 ${
              leadsTableView === "accepted"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Accepted leads
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <button
            type="button"
            onClick={handleReapplyRules}
            disabled={reapplyRulesInProgress}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {reapplyRulesInProgress ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Re-apply rules
          </button>
          {leadsTableView === "accepted" && (
            <button
              type="button"
              onClick={runAcceptedSync}
              disabled={acceptedSyncInProgress}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              aria-label="Sync accepted leads with hipages now"
            >
              {acceptedSyncInProgress ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Sync now
            </button>
          )}
          <span className="text-xs text-neutral-500" aria-hidden="true">
            {lastLeadsUpdateAt
              ? (() => {
                  const mins = Math.floor((Date.now() - lastLeadsUpdateAt) / 60_000);
                  if (mins < 1) return "Last updated just now";
                  if (mins === 1) return "Last updated 1 min ago";
                  return `Last updated ${mins} min ago`;
                })()
              : "Last updated —"}
          </span>
        </div>
      </div>

      {/* Leads table or empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-16 shadow-sm">
          {leadsTableView === "accepted" && leadsForView.length === 0 ? (
            <>
              <p className="text-center text-base font-medium text-neutral-900">No accepted leads yet</p>
              <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
                Leads you accept on the platform (e.g. hipages) will appear here and stay in this table.
              </p>
            </>
          ) : leads.length === 0 ? (
            <>
              <p className="text-center text-base font-medium text-neutral-900">No leads yet</p>
              <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
                Leads will appear here when you run a test scan or connect live sources. Configure sources and rule sets in Lead Management.
              </p>
              <Link
                href={(base || "/control-centre") + "/leads/management"}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
              >
                Open Lead Management
              </Link>
            </>
          ) : (
            <>
              <p className="text-center text-base font-medium text-neutral-900">No leads match your filters</p>
              <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
                Try changing the source, decision, status, date, or search.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterSource("");
                  setFilterDecision("");
                  setFilterStatus("");
                  setFilterDate("");
                  setFilterSearch("");
                }}
                className="mt-4 min-h-[44px] rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          {/* Bulk action bar */}
          {checkedIds.size > 0 && (
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
              <span className="text-sm font-medium text-neutral-700">
                {checkedIds.size} selected
              </span>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {bulkDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete selected
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-100">
              <thead className="bg-neutral-50/80">
                <tr>
                  {/* Select-all checkbox */}
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Suburb / Postcode
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Score
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    <button
                      type="button"
                      onClick={handleSortCost}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
                    >
                      Cost
                      {sortBy === "cost" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <span className="inline-flex gap-0.5 text-neutral-400">
                          <ChevronUp className="h-3 w-3" aria-hidden />
                          <ChevronDown className="h-3 w-3 -ml-1.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Decision
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    <button
                      type="button"
                      onClick={handleSortPosted}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
                    >
                      Posted
                      {sortBy === "posted" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <span className="inline-flex gap-0.5 text-neutral-400">
                          <ChevronUp className="h-3 w-3" aria-hidden />
                          <ChevronDown className="h-3 w-3 -ml-1.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Reasons
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Platform Action
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {sorted.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`text-sm transition-colors ${checkedIds.has(lead.id) ? "bg-neutral-50" : ""}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select lead`}
                        checked={checkedIds.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                        className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                      />
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-neutral-600">
                      {lead.customerName || lead.email || lead.phone ? (
                        <div className="flex flex-col gap-0.5">
                          {lead.customerName && (
                            <span className="truncate font-medium text-neutral-900">{lead.customerName}</span>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="truncate text-xs text-accent hover:underline" title={lead.email}>
                              {lead.email}
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="truncate text-xs text-neutral-600 hover:underline" title={lead.phone}>
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      ) : lead.sourceName?.toLowerCase().includes("hipages") && lead.sourceId ? (
                        <button
                          type="button"
                          disabled={!!fetchCustomerLeadId}
                          onClick={async () => {
                            setFetchCustomerLeadId(lead.id);
                            try {
                              await handleFetchCustomer(lead.id, lead.sourceId);
                            } finally {
                              setFetchCustomerLeadId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                        >
                          {fetchCustomerLeadId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Fetch
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {lead.sourceName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {suburbPostcode(lead)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                      {lead.score}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-neutral-900">
                      {lead.leadCost ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <DecisionBadge decision={lead.decision} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ActivityStatusBadge status={lead.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                      {formatReceivedDate(lead)}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-neutral-600">
                      {formatReasons(lead.reasons)}
                    </td>
                    {/* Hipages platform actions */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {lead.hipagesActions && Object.keys(lead.hipagesActions).length > 0 ? (
                        hipagesActionResult[lead.id] === "ok" ? (
                          <span className="text-xs font-medium text-emerald-600">✓ Done</span>
                        ) : hipagesActionResult[lead.id] === "error" ? (
                          <span className="text-xs font-medium text-red-500">Failed</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {lead.hipagesActions.accept && (
                              <button
                                type="button"
                                disabled={!!hipagesActingId}
                                onClick={() => handleHipagesAction(lead, "accept", lead.hipagesActions!.accept!)}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {hipagesActingId === `${lead.id}-accept` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {lead.hipagesActions.acceptLabel ?? "Accept"}
                              </button>
                            )}
                            {lead.hipagesActions.waitlist && (
                              <button
                                type="button"
                                disabled={!!hipagesActingId}
                                onClick={() => handleHipagesAction(lead, "waitlist", lead.hipagesActions!.waitlist!)}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              >
                                {hipagesActingId === `${lead.id}-waitlist` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {lead.hipagesActions.waitlistLabel ?? "Waitlist"}
                              </button>
                            )}
                            {lead.hipagesActions.decline && (
                              <button
                                type="button"
                                disabled={!!hipagesActingId}
                                onClick={() => handleHipagesAction(lead, "decline", lead.hipagesActions!.decline!)}
                                className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                {hipagesActingId === `${lead.id}-decline` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {lead.hipagesActions.declineLabel ?? "Decline"}
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="ml-auto flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="View lead details"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete lead"
                          disabled={deletingId === lead.id}
                          onClick={() => handleDelete(lead.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          {deletingId === lead.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActivityLeadModal
        lead={selectedLead}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
