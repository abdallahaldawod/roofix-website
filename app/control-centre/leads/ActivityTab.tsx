"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Eye, Loader2, AlertCircle } from "lucide-react";
import { StatCard } from "./StatCard";
import { ActivityLeadModal } from "./ActivityLeadModal";
import { getActivity } from "@/lib/leads/activity";
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

function formatTime(ts: LeadActivity["scannedAt"]): string {
  if (!ts) return "—";
  return new Date(ts.seconds * 1000).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type ActivityTabProps = {
  refreshKey?: number;
};

export function ActivityTab({ refreshKey = 0 }: ActivityTabProps) {
  const [leads, setLeads] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivity(100);
      setLeads(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

  // Computed stats
  const totalToday = leads.length;
  const accepted = leads.filter((l) => l.decision === "Accept").length;
  const rejected = leads.filter((l) => l.decision === "Reject").length;
  const review = leads.filter((l) => l.decision === "Review").length;
  const failed = leads.filter((l) => l.status === "Failed").length;

  // Client-side filtering
  const filtered = leads.filter((lead) => {
    if (filterSource && lead.sourceName !== filterSource) return false;
    if (filterDecision && lead.decision !== filterDecision) return false;
    if (filterStatus && lead.status !== filterStatus) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (
        !lead.title.toLowerCase().includes(q) &&
        !lead.suburb.toLowerCase().includes(q) &&
        !lead.sourceName.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const selectClass =
    "min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

  const uniqueSources = Array.from(new Set(leads.map((l) => l.sourceName)));

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading activity...</span>
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
          onClick={load}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
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

      {/* Activity table or empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-16 shadow-sm">
          <p className="text-center text-base font-medium text-neutral-900">No activity yet</p>
          <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
            Lead scan activity will appear here once sources are active or a test scan is run.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          {/* Mobile: card list */}
          <div className="space-y-3 p-4 md:hidden">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <p className="font-medium text-neutral-900">{lead.title}</p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  {lead.sourceName} · {lead.suburb}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DecisionBadge decision={lead.decision} />
                  <ActivityStatusBadge status={lead.status} />
                  <span className="text-xs text-neutral-500">
                    Score {lead.score} · {formatTime(lead.scannedAt)}
                  </span>
                </div>
                {lead.matchedKeywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lead.matchedKeywords.slice(0, 3).map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
                      >
                        {kw}
                      </span>
                    ))}
                    {lead.matchedKeywords.length > 3 && (
                      <span className="text-xs text-neutral-500">+{lead.matchedKeywords.length - 3}</span>
                    )}
                  </div>
                )}
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <button
                    type="button"
                    aria-label="View lead details"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-neutral-100">
              <thead className="bg-neutral-50/80">
                <tr>
                  {[
                    "Lead Title",
                    "Source",
                    "Suburb",
                    "Matched Keywords",
                    "Score",
                    "Decision",
                    "Time",
                    "Status",
                    "Actions",
                  ].map((col, i) => (
                    <th
                      key={col}
                      scope="col"
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 ${
                        i === 8 ? "text-right" : "text-left"
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="text-sm">
                    <td className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 font-medium text-neutral-900">
                      {lead.title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {lead.sourceName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {lead.suburb}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.matchedKeywords.length === 0 ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          <>
                            {lead.matchedKeywords.slice(0, 2).map((kw) => (
                              <span
                                key={kw}
                                className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
                              >
                                {kw}
                              </span>
                            ))}
                            {lead.matchedKeywords.length > 2 && (
                              <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                                +{lead.matchedKeywords.length - 2}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                      {lead.score}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <DecisionBadge decision={lead.decision} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                      {formatTime(lead.scannedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ActivityStatusBadge status={lead.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label="View lead details"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="ml-auto flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lead detail modal */}
      <ActivityLeadModal
        lead={selectedLead}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
