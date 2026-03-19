"use client";

import { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import type { HipagesJob } from "@/lib/leads/hipages-jobs-types";
import {
  formatHipagesJobCost,
  formatHipagesJobPosted,
  formatHipagesJobLastSync,
  suburbPostcodeLine,
} from "@/lib/leads/hipages-jobs-format";

type Props = {
  job: HipagesJob | null;
  onClose: () => void;
};

export function HipagesJobDetailModal({ job, onClose }: Props) {
  useEffect(() => {
    if (!job) return;
    // #region agent log
    fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b3ba84" },
      body: JSON.stringify({
        sessionId: "b3ba84",
        runId: "ui-job-modal",
        hypothesisId: "H1",
        location: "HipagesJobDetailModal.tsx",
        message: "detail_modal_job_fields",
        data: {
          jobId: job.jobId,
          hasTitle: !!(job.title && job.title.trim()),
          hasDesc: !!((job.fullDescription ?? job.description ?? "").trim()),
          hasCost: !!(job.leadCost && String(job.leadCost).trim()) || job.leadCostCredits != null,
          hasPosted: !!(job.postedAt ?? job.postedAtIso ?? job.postedAtText),
          hasContact: !!(job.email || job.phone),
          hasSuburb: !!(job.suburb || job.postcode),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [job]);

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white shadow-lg sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-snug text-neutral-900">
              {job.title || `Job ${job.jobId}`}
            </h2>
            {job.serviceType ? (
              <p className="mt-1 text-sm text-neutral-600">{job.serviceType}</p>
            ) : null}
            <p className="mt-1 text-xs text-neutral-500">Job #{job.jobId}</p>
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

        <div className="space-y-4 p-6">
          {job.href ? (
            <a
              href={job.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-2 hover:underline"
            >
              Open on Hipages
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : null}

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Summary</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-neutral-500">Customer</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{job.customerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Location</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{suburbPostcodeLine(job)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Status</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{job.jobStatus || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Create quote</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">
                  {job.canCreateQuote === undefined ? "—" : job.canCreateQuote ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Cost</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{formatHipagesJobCost(job)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Posted</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{formatHipagesJobPosted(job)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Last synced</dt>
                <dd className="mt-0.5 text-sm font-medium text-neutral-900">{formatHipagesJobLastSync(job)}</dd>
              </div>
            </dl>
          </div>

          {(job.email || job.phone) && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Contact</h3>
              <div className="grid gap-2 text-sm">
                {job.email ? (
                  <a href={`mailto:${job.email}`} className="font-medium text-accent hover:underline">
                    {job.email}
                  </a>
                ) : null}
                {job.phone ? (
                  <a href={`tel:${job.phone}`} className="font-medium text-neutral-900 hover:underline">
                    {job.phone}
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {(job.fullDescription || job.description) && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</h3>
              <p className="whitespace-pre-wrap text-sm text-neutral-800">
                {job.fullDescription || job.description}
              </p>
            </div>
          )}

          {job.attachments && job.attachments.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Attachments ({job.attachments.length})
              </h3>
              <ul className="space-y-2 text-sm">
                {job.attachments.map((a, i) => (
                  <li key={i}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {a.label || a.url.slice(0, 60) + (a.url.length > 60 ? "…" : "")}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
