"use client";

import { X } from "lucide-react";
import type { LeadActivity, LeadDecision, LeadActivityStatus } from "@/lib/leads/types";

/** Split text and wrap matched keywords (case-insensitive) in <mark> for highlighting. */
function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
  if (!text.trim() || keywords.length === 0) return text;
  const trimmed = keywords.filter((k) => k.trim().length > 0).map((k) => k.trim());
  if (trimmed.length === 0) return text;
  const keywordSet = new Set(trimmed.map((k) => k.toLowerCase()));
  const escaped = trimmed
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 0 && keywordSet.has(part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-amber-200/80 px-0.5 font-medium text-amber-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type ActivityDecision = LeadDecision;
type ActivityStatus = LeadActivityStatus;

function DecisionBadge({ decision }: { decision: ActivityDecision }) {
  const styles: Record<ActivityDecision, string> = {
    Accept: "bg-emerald-50 text-emerald-800",
    Review: "bg-amber-50 text-amber-800",
    Reject: "bg-red-50 text-red-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[decision]}`}>
      {decision}
    </span>
  );
}

function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
  const styles: Record<ActivityStatus, string> = {
    Scanned: "bg-neutral-100 text-neutral-600",
    Processed: "bg-emerald-50 text-emerald-800",
    Failed: "bg-red-50 text-red-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

type ActivityLeadModalProps = {
  lead: LeadActivity | null;
  onClose: () => void;
};

export function ActivityLeadModal({ lead, onClose }: ActivityLeadModalProps) {
  if (!lead) return null;

  const showCustomerSection = Boolean(lead.customerName || lead.email || lead.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white shadow-lg sm:rounded-xl">
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-neutral-900 leading-snug">
              {lead.matchedKeywords?.length > 0
                ? highlightKeywords(lead.title || "", lead.matchedKeywords)
                : (lead.title || "")}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <DecisionBadge decision={lead.decision} />
              <ActivityStatusBadge status={lead.status} />
              <span className="text-xs text-neutral-500">
                {(() => {
                  if (lead.postedAtText) return lead.postedAtText;
                  if (lead.postedAtIso) {
                    const d = new Date(lead.postedAtIso);
                    if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
                  }
                  const ts = lead.scannedAt;
                  return ts ? new Date(ts.seconds * 1000).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
                })()}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="space-y-4 p-6">
          {lead.externalUrl ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <a
                href={lead.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
              >
                Open job in Hipages →
              </a>
            </div>
          ) : null}
          {/* Customer / contact (website leads or hipages fetch) */}
          {showCustomerSection && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Customer
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {lead.customerName && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500">Name</p>
                    <p className="mt-0.5 text-sm font-medium text-neutral-900">{lead.customerName}</p>
                  </div>
                )}
                {lead.email && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500">Email</p>
                    <a href={`mailto:${lead.email}`} className="mt-0.5 block text-sm font-medium text-accent hover:underline">
                      {lead.email}
                    </a>
                  </div>
                )}
                {lead.phone && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500">Phone</p>
                    <a href={`tel:${lead.phone}`} className="mt-0.5 block text-sm font-medium text-accent hover:underline">
                      {lead.phone}
                    </a>
                  </div>
                )}
                {lead.serviceType && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500">Service type</p>
                    <p className="mt-0.5 text-sm font-medium text-neutral-900">{lead.serviceType}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Meta grid: source attribution, received date, location */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Lead Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-neutral-500">Source</p>
                <p className="mt-0.5 text-sm font-medium text-neutral-900">{lead.sourceName}</p>
              </div>
              {lead.canCreateQuote !== undefined && (
                <div>
                  <p className="text-xs font-medium text-neutral-500">Create quote on Hipages</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900">
                    {lead.canCreateQuote ? "Yes" : "No"}
                  </p>
                </div>
              )}
              {(lead.leadCost || (lead.leadCostCredits != null && Number.isFinite(lead.leadCostCredits))) && (
                <div>
                  <p className="text-xs font-medium text-neutral-500">Cost to accept</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900">
                    {lead.leadCost && lead.leadCost.trim() !== "" ? lead.leadCost : `${lead.leadCostCredits} credits`}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-neutral-500">
                  {lead.postedAt || lead.postedAtText ? "Posted on platform" : "Received"}
                </p>
                <p className="mt-0.5 text-sm font-medium text-neutral-900">
                  {(() => {
                    if (lead.postedAtText) return lead.postedAtText;
                    if (lead.postedAtIso) {
                      const d = new Date(lead.postedAtIso);
                      if (!isNaN(d.getTime())) return d.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
                    }
                    const ts = lead.scannedAt;
                    return ts ? new Date(ts.seconds * 1000).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—";
                  })()}
                </p>
              </div>
              {lead.postedAt && lead.scannedAt && (
                <div>
                  <p className="text-xs font-medium text-neutral-500">Imported</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900">
                    {new Date(lead.scannedAt.seconds * 1000).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-neutral-500">Suburb</p>
                <p className="mt-0.5 text-sm font-medium text-neutral-900">{lead.suburb}</p>
              </div>
              {lead.postcode && (
                <div>
                  <p className="text-xs font-medium text-neutral-500">Postcode</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900">{lead.postcode}</p>
                </div>
              )}
            </div>
          </div>

          {/* Attachments (e.g. hipages photos/documents) */}
          {lead.attachments && lead.attachments.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Attachments
              </h3>
              <div className="flex flex-wrap gap-4">
                {lead.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-neutral-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                  >
                    <img
                      src={att.url}
                      alt={att.label ?? "Attachment"}
                      className="h-40 w-auto max-w-full object-contain"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        const fallback = target.nextElementSibling;
                        if (fallback) (fallback as HTMLElement).style.display = "block";
                      }}
                    />
                    <span
                      className="hidden px-3 py-2 text-sm font-medium text-accent"
                      style={{ display: "none" }}
                    >
                      {att.label ?? "View attachment"} ↗
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 3. Description */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Description
            </h3>
            {lead.matchedKeywords?.length > 0 ? (
              <>
                <p className="mb-1.5 text-xs text-neutral-500">
                  Rule set applied to this lead’s title and description. Matched keywords highlighted below.
                </p>
                <p className="text-sm text-neutral-700 leading-relaxed">
                  {highlightKeywords(lead.description || "", lead.matchedKeywords)}
                </p>
              </>
            ) : (
              <p className="text-sm text-neutral-700 leading-relaxed">{lead.description}</p>
            )}
          </div>

          {/* 4. Matched Keywords */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Matched Keywords
            </h3>
            {lead.matchedKeywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lead.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No keywords matched</p>
            )}
          </div>

          {/* 5. Score Breakdown */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Score Breakdown
            </h3>
            {lead.scoreBreakdown.length > 0 ? (
              <div className="space-y-1.5">
                {lead.scoreBreakdown.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-neutral-700">{item.keyword}</span>
                    <span className="tabular-nums font-medium text-neutral-900">
                      +{item.score}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2 text-sm font-semibold">
                  <span className="text-neutral-700">Total Score</span>
                  <span className="tabular-nums text-neutral-900">{lead.score}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No scoring data available</p>
            )}
          </div>

          {/* 6. Final Decision & Reasons */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Final Decision
            </h3>
            <div className="flex items-center gap-4">
              <DecisionBadge decision={lead.decision} />
              <span className="tabular-nums text-sm font-semibold text-neutral-900">
                Score: {lead.score}
              </span>
            </div>
            {lead.reasons && lead.reasons.length > 0 && (
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-neutral-700">
                {lead.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-neutral-500">
              Based on rule set thresholds applied at scan time.
            </p>
          </div>

          {/* 7. Activity Timeline */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Activity Timeline
            </h3>
            <ol className="relative border-l border-neutral-200 pl-4 space-y-3">
              {lead.timeline.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-neutral-400" />
                  <span className="shrink-0 tabular-nums text-xs text-neutral-400 min-w-[9rem]">
                    {item.time}
                  </span>
                  <span className="text-sm text-neutral-700">{item.event}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
