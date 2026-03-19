"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Search, Eye, Loader2, AlertCircle, Settings, Trash2, ChevronUp, ChevronDown, Check } from "lucide-react";
import { useControlCentreBase } from "../use-base-path";
import { StatCard } from "./StatCard";
import { ActivityLeadModal } from "./ActivityLeadModal";
import { subscribeToActivity, deleteActivity, deleteActivities } from "@/lib/leads/activity";
import { getSources } from "@/lib/leads/sources";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { LeadActivity, LeadDecision, LeadActivityStatus } from "@/lib/leads/types";

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

/** Parse leadCost to a number for sorting (e.g. "$12.50" → 12.5, "30 credits" → 30, "Free" → 0). Missing/invalid → null. */
function parseLeadCostToNumber(leadCost: string | undefined): number | null {
  if (!leadCost || typeof leadCost !== "string") return null;
  const t = leadCost.trim();
  if (/^free$/i.test(t)) return 0;
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
  const [hipagesActionResult, setHipagesActionResult] = useState<Record<string, "accept" | "decline" | "waitlist" | "error">>({});
  /** When action fails, store the API error message (and optional step) for display. */
  const [hipagesActionError, setHipagesActionError] = useState<Record<string, string>>({});
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
  const [retryCount, setRetryCount] = useState(0);
  const [acceptedSyncInProgress, setAcceptedSyncInProgress] = useState(false);
  const acceptedSyncInProgressRef = useRef(false);
  const [hipagesCredit, setHipagesCredit] = useState<string | null>(null);
  const [hipagesCreditLoading, setHipagesCreditLoading] = useState(false);
  const [hipagesCreditError, setHipagesCreditError] = useState<string | null>(null);
  const [scanNewInProgress, setScanNewInProgress] = useState(false);
  const [scanNewError, setScanNewError] = useState<string | null>(null);

  type SortBy = "cost" | "posted";
  const [sortBy, setSortBy] = useState<SortBy>("posted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Apply ?source= from URL (e.g. from "View leads from this source")
  useEffect(() => {
    if (sourceFromUrl) setFilterSource(decodeURIComponent(sourceFromUrl));
  }, [sourceFromUrl]);

  // Realtime subscription: table updates on any add/update/delete in lead_activity (e.g. after each local scan).
  const previousLeadCountRef = useRef<number>(0);
  const [newLeadsBanner, setNewLeadsBanner] = useState<number | null>(null);
  useEffect(() => {
    setLoading(true);
    setError(null);
    previousLeadCountRef.current = 0;
    const unsubscribe = subscribeToActivity(
      (data) => {
        const prevCount = previousLeadCountRef.current;
        previousLeadCountRef.current = data.length;
        setLeads(data);
        setLastLeadsUpdateAt(Date.now());
        setLoading(false);
        if (prevCount > 0 && data.length > prevCount) {
          const added = data.length - prevCount;
          setNewLeadsBanner(added);
        }
        // #region agent log
        const noCostHipages = data.filter((l) => !l.leadCost && (l.sourceName?.toLowerCase().includes("hipages") ?? false));
        if (noCostHipages.length > 0) {
          fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a5692" }, body: JSON.stringify({ sessionId: "7a5692", location: "LeadsPageClient.tsx:subscribe", message: "leads_without_cost_hipages", data: { activityIds: noCostHipages.slice(0, 15).map((l) => l.id), count: noCostHipages.length }, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
        }
        // #endregion
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [retryCount]);

  useEffect(() => {
    if (newLeadsBanner === null) return;
    const t = setTimeout(() => setNewLeadsBanner(null), 5000);
    return () => clearTimeout(t);
  }, [newLeadsBanner]);

  const getToken = useCallback(async (): Promise<string> => {
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, []);

  // Fetch hipages credit once on mount (business.hipages.com.au)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHipagesCreditLoading(true);
      setHipagesCreditError(null);
      try {
        const token = await getToken();
        const res = await fetch("/api/control-centre/leads/hipages-credit", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.ok === true && typeof data.credit === "string") {
          setHipagesCredit(data.credit);
        } else {
          setHipagesCredit(null);
          setHipagesCreditError(typeof data.error === "string" ? data.error : null);
        }
      } catch {
        if (!cancelled) {
          setHipagesCredit(null);
          setHipagesCreditError("Failed to load");
        }
      } finally {
        if (!cancelled) setHipagesCreditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  // Update "Last updated Xs ago" every 2s when recent, so the status line stays current
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2_000);
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

  /** Run background scan for Hipages source(s) to pull new leads into the table. */
  const runScanNewLeads = useCallback(async () => {
    setScanNewError(null);
    setScanNewInProgress(true);
    try {
      const sources = await getSources();
      const hipages = sources.filter(
        (s) => s.storageStatePath && s.name.toLowerCase().includes("hipages")
      );
      if (hipages.length === 0) {
        setScanNewError("No connected Hipages source. Connect a source in Lead Management.");
        return;
      }
      const token = await getToken();
      for (const source of hipages) {
        const res = await fetch("/api/control-centre/leads/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId: source.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setScanNewError(data?.error ?? "Scan failed");
          return;
        }
      }
      setLastLeadsUpdateAt(Date.now());
    } catch (e) {
      setScanNewError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanNewInProgress(false);
    }
  }, [getToken]);

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

  const handleHipagesAction = useCallback(
    async (lead: LeadActivity, action: "accept" | "decline" | "waitlist", actionPath: string) => {
      if (hipagesActingId) return;
      setHipagesActingId(`${lead.id}-${action}`);
      setHipagesActionError((prev) => ({ ...prev, [lead.id]: "" }));
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
        const ok = data.ok === true;
        setHipagesActionResult((prev) => ({ ...prev, [lead.id]: ok ? action : "error" }));
        if (!ok) {
          const errMsg = typeof data.error === "string" ? data.error : "Action failed";
          const step = typeof data.step === "string" ? data.step : "";
          setHipagesActionError((prev) => ({ ...prev, [lead.id]: step ? `${errMsg} (${step})` : errMsg }));
        } else {
          handleFetchCustomer(lead.id, lead.sourceId).catch(() => {});
          if (action === "accept") runAcceptedSync().catch(() => {});
          // Clear success state after 2.5s so the button label resets (in case lead stays in list)
          setTimeout(() => {
            setHipagesActionResult((prev) => {
              const next = { ...prev };
              delete next[lead.id];
              return next;
            });
          }, 2500);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Request failed";
        setHipagesActionResult((prev) => ({ ...prev, [lead.id]: "error" }));
        setHipagesActionError((prev) => ({ ...prev, [lead.id]: errMsg }));
      } finally {
        setHipagesActingId(null);
      }
    },
    [hipagesActingId, getToken, handleFetchCustomer, runAcceptedSync]
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

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

  const totalToday = leads.length;
  const accepted = leads.filter((l) => l.decision === "Accept").length;
  const rejected = leads.filter((l) => l.decision === "Reject").length;
  const review = leads.filter((l) => l.decision === "Review").length;
  const failed = leads.filter((l) => l.status === "Failed").length;

  const leadsForView = useMemo(
    () =>
      leadsTableView === "accepted"
        ? leads.filter((l) => l.platformAccepted === true)
        : leads.filter((l) => l.platformAccepted !== true),
    [leads, leadsTableView]
  );

  const filtered = useMemo(() => {
    return leadsForView.filter((lead) => {
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
  }, [leadsForView, filterSource, filterDecision, filterStatus, filterDate, filterSearch]);

  const statusOrder: Record<string, number> = { Processed: 0, Scanned: 1, Failed: 2 };
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortBy, sortDir]);

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
    "min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

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
                className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
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
            className={`min-h-[44px] flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none sm:px-6 ${
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
            className={`min-h-[44px] flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none sm:px-6 ${
              leadsTableView === "accepted"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Accepted leads
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-1.5 text-xs"
            aria-hidden="true"
          >
            <span className="font-medium text-neutral-500">HiPages</span>
            {hipagesCreditLoading ? (
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-neutral-700">
                <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                …
              </span>
            ) : hipagesCreditError ? (
              <span className="font-semibold tabular-nums text-neutral-400" title={hipagesCreditError}>
                —
              </span>
            ) : hipagesCredit ? (
              <span className="font-semibold tabular-nums text-neutral-900">{hipagesCredit}</span>
            ) : (
              <span className="font-semibold tabular-nums text-neutral-400">—</span>
            )}
          </div>
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
          {scanNewError && (
            <span className="text-xs text-red-600" title={scanNewError}>
              {scanNewError.length > 40 ? `${scanNewError.slice(0, 40)}…` : scanNewError}
            </span>
          )}
          {scanNewInProgress && (
            <span className="text-xs font-medium text-neutral-600">Scanning…</span>
          )}
          {newLeadsBanner != null && newLeadsBanner > 0 && (
            <span className="text-xs font-medium text-emerald-600">
              {newLeadsBanner === 1 ? "1 new lead imported" : `${newLeadsBanner} new leads imported`}
            </span>
          )}
          <span className="text-xs text-neutral-500" aria-hidden="true">
            {lastLeadsUpdateAt
              ? (() => {
                  const secs = Math.floor((Date.now() - lastLeadsUpdateAt) / 1000);
                  if (secs < 60) return secs <= 5 ? "Last updated just now" : `Last updated ${secs}s ago`;
                  const mins = Math.floor(secs / 60);
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
                New leads from Hipages appear here after you run a scan. Use <strong>Scan now</strong> above, or run a scan from Lead Management.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={runScanNewLeads}
                  disabled={scanNewInProgress}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
                >
                  {scanNewInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Scan now
                </button>
                <Link
                  href={(base || "/control-centre") + "/leads/management"}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Settings className="h-4 w-4" />
                  Lead Management
                </Link>
              </div>
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
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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
          {/* Mobile: card list */}
          <div className="space-y-3 p-4 md:hidden">
            {sorted.map((lead) => (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 ${checkedIds.has(lead.id) ? "border-neutral-300 bg-neutral-50" : "border-neutral-200 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center pt-0.5">
                    <input
                      type="checkbox"
                      aria-label={`Select lead ${lead.customerName || lead.sourceName || lead.id}`}
                      checked={checkedIds.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="h-5 w-5 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DecisionBadge decision={lead.decision} />
                      <ActivityStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-1.5 font-medium text-neutral-900">
                      {lead.customerName || lead.email || lead.phone || lead.sourceName || "—"}
                    </p>
                    {lead.customerName && (lead.email || lead.phone) && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        {[lead.email, lead.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {lead.sourceName} · {suburbPostcode(lead)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Score {lead.score} · {lead.leadCost ?? "—"} · {formatReceivedDate(lead)}
                    </p>
                    {lead.reasons?.length ? (
                      <p className="mt-1 truncate text-xs text-neutral-600">{formatReasons(lead.reasons)}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3">
                  {hipagesActionError[lead.id] && (
                    <span className="text-xs text-red-600">{hipagesActionError[lead.id]}</span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {leadsTableView === "new" &&
                      lead.sourceName?.toLowerCase().includes("hipages") &&
                      (lead.hipagesActions?.accept || lead.hipagesActions?.decline || lead.hipagesActions?.waitlist) && (
                        <>
                          {lead.hipagesActions.accept && (
                            <button
                              type="button"
                              disabled={!!hipagesActingId}
                              onClick={() => handleHipagesAction(lead, "accept", lead.hipagesActions!.accept!)}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {hipagesActingId === `${lead.id}-accept` ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  Accepting…
                                </>
                              ) : hipagesActionResult[lead.id] === "accept" ? (
                                <>
                                  <Check className="h-4 w-4" aria-hidden />
                                  Accepted
                                </>
                              ) : (
                                "Accept"
                              )}
                            </button>
                          )}
                          {lead.hipagesActions.decline && (
                            <button
                              type="button"
                              disabled={!!hipagesActingId}
                              onClick={() => handleHipagesAction(lead, "decline", lead.hipagesActions!.decline!)}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                            >
                              {hipagesActingId === `${lead.id}-decline` ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  Declining…
                                </>
                              ) : hipagesActionResult[lead.id] === "decline" ? (
                                <>
                                  <Check className="h-4 w-4" aria-hidden />
                                  Declined
                                </>
                              ) : (
                                "Decline"
                              )}
                            </button>
                          )}
                          {lead.hipagesActions.waitlist && (
                            <button
                              type="button"
                              disabled={!!hipagesActingId}
                              onClick={() => handleHipagesAction(lead, "waitlist", lead.hipagesActions!.waitlist!)}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                            >
                              {hipagesActingId === `${lead.id}-waitlist` ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  Adding…
                                </>
                              ) : hipagesActionResult[lead.id] === "waitlist" ? (
                                <>
                                  <Check className="h-4 w-4" aria-hidden />
                                  Waitlisted
                                </>
                              ) : (
                                "Waitlist"
                              )}
                            </button>
                          )}
                        </>
                      )}
                  <button
                    type="button"
                    aria-label="View lead details"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete lead"
                    disabled={deletingId === lead.id}
                    onClick={() => handleDelete(lead.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    {deletingId === lead.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
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
                    <td
                      className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-neutral-900"
                      title={
                        lead.leadCost
                          ? undefined
                          : lead.sourceName?.toLowerCase().includes("hipages")
                            ? lead.platformAccepted
                              ? "Cost not found when syncing. Run Sync now on Accepted leads to re-fetch job details."
                              : "Cost not found. Use Fetch on the customer cell to refresh from the job page."
                            : undefined
                      }
                    >
                      {lead.leadCost ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                      {formatReceivedDate(lead)}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-neutral-600">
                      {formatReasons(lead.reasons)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="ml-auto flex flex-col items-end gap-1">
                        {hipagesActionError[lead.id] && (
                          <span className="text-xs text-red-600" title={hipagesActionError[lead.id]}>
                            {hipagesActionError[lead.id].length > 30 ? `${hipagesActionError[lead.id].slice(0, 30)}…` : hipagesActionError[lead.id]}
                          </span>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {/* Platform actions: only for new leads (hipages) with action paths */}
                          {leadsTableView === "new" &&
                            lead.sourceName?.toLowerCase().includes("hipages") &&
                            (lead.hipagesActions?.accept || lead.hipagesActions?.decline || lead.hipagesActions?.waitlist) && (
                            <>
                              {lead.hipagesActions.accept && (
                                <button
                                  type="button"
                                  disabled={!!hipagesActingId}
                                  onClick={() =>
                                    handleHipagesAction(lead, "accept", lead.hipagesActions!.accept!)
                                  }
                                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                  aria-label={hipagesActionResult[lead.id] === "accept" ? "Accepted" : hipagesActingId === `${lead.id}-accept` ? "Accepting…" : "Accept"}
                                >
                                  {hipagesActingId === `${lead.id}-accept` ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                      Accepting…
                                    </>
                                  ) : hipagesActionResult[lead.id] === "accept" ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" aria-hidden />
                                      Accepted
                                    </>
                                  ) : (
                                    "Accept"
                                  )}
                                </button>
                              )}
                              {lead.hipagesActions.decline && (
                                <button
                                  type="button"
                                  disabled={!!hipagesActingId}
                                  onClick={() =>
                                    handleHipagesAction(lead, "decline", lead.hipagesActions!.decline!)
                                  }
                                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                                  aria-label={hipagesActionResult[lead.id] === "decline" ? "Declined" : hipagesActingId === `${lead.id}-decline` ? "Declining…" : "Decline"}
                                >
                                  {hipagesActingId === `${lead.id}-decline` ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                      Declining…
                                    </>
                                  ) : hipagesActionResult[lead.id] === "decline" ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" aria-hidden />
                                      Declined
                                    </>
                                  ) : (
                                    "Decline"
                                  )}
                                </button>
                              )}
                              {lead.hipagesActions.waitlist && (
                                <button
                                  type="button"
                                  disabled={!!hipagesActingId}
                                  onClick={() =>
                                    handleHipagesAction(lead, "waitlist", lead.hipagesActions!.waitlist!)
                                  }
                                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                                  aria-label={hipagesActionResult[lead.id] === "waitlist" ? "Added to waitlist" : hipagesActingId === `${lead.id}-waitlist` ? "Adding to waitlist…" : "Waitlist"}
                                >
                                  {hipagesActingId === `${lead.id}-waitlist` ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                      Adding…
                                    </>
                                  ) : hipagesActionResult[lead.id] === "waitlist" ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" aria-hidden />
                                      Waitlisted
                                    </>
                                  ) : (
                                    "Waitlist"
                                  )}
                                </button>
                              )}
                            </>
                          )}
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
