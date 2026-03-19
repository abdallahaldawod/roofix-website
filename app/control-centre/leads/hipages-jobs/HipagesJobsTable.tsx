"use client";

import { ExternalLink, Eye } from "lucide-react";
import type { HipagesJob } from "@/lib/leads/hipages-jobs-types";
import {
  formatHipagesJobCost,
  formatHipagesJobPosted,
  formatHipagesJobLastSync,
  suburbPostcodeLine,
} from "@/lib/leads/hipages-jobs-format";

type Props = {
  jobs: HipagesJob[];
  onOpenDetail: (job: HipagesJob) => void;
};

function contactSummary(job: HipagesJob): string {
  const parts: string[] = [];
  if (job.email) parts.push(job.email);
  if (job.phone) parts.push(job.phone);
  return parts.join(" · ") || "—";
}

export function HipagesJobsTable({ jobs, onOpenDetail }: Props) {
  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 p-4 md:hidden">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-neutral-900">{job.customerName || "—"}</p>
            <p className="mt-1 text-sm text-neutral-700 line-clamp-2">{job.title || "—"}</p>
            {job.serviceType ? (
              <p className="mt-0.5 text-xs text-neutral-500">{job.serviceType}</p>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">
              {suburbPostcodeLine(job)} · {formatHipagesJobCost(job)} · {formatHipagesJobPosted(job)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Status: {job.jobStatus || "—"} · Images: {job.attachments?.length ?? 0}
            </p>
            <p className="mt-1 truncate text-xs text-neutral-600">{contactSummary(job)}</p>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {job.href ? (
                <a
                  href={job.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Hipages
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenDetail(job)}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-neutral-100">
          <thead className="bg-neutral-50/80">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Customer
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Title / Service
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Suburb
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Cost
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Posted
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Contact
              </th>
              <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Images
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Synced
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Link
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {jobs.map((job) => (
              <tr key={job.id} className="text-sm text-neutral-700">
                <td className="max-w-[140px] px-4 py-3 font-medium text-neutral-900">
                  {job.customerName || "—"}
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <div className="line-clamp-2 font-medium text-neutral-900">{job.title || "—"}</div>
                  {job.serviceType ? (
                    <div className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{job.serviceType}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{suburbPostcodeLine(job)}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{formatHipagesJobCost(job)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-500">{formatHipagesJobPosted(job)}</td>
                <td className="max-w-[120px] truncate px-4 py-3" title={job.jobStatus ?? undefined}>
                  {job.jobStatus || "—"}
                </td>
                <td className="max-w-[180px] px-4 py-3">
                  <div className="flex flex-col gap-0.5 text-xs">
                    {job.email ? (
                      <a href={`mailto:${job.email}`} className="truncate text-accent hover:underline" title={job.email}>
                        {job.email}
                      </a>
                    ) : null}
                    {job.phone ? (
                      <a href={`tel:${job.phone}`} className="truncate text-neutral-600 hover:underline" title={job.phone}>
                        {job.phone}
                      </a>
                    ) : null}
                    {!job.email && !job.phone ? <span className="text-neutral-400">—</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-center tabular-nums">{job.attachments?.length ?? 0}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{formatHipagesJobLastSync(job)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {job.href ? (
                      <a
                        href={job.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                        title="Open on Hipages"
                        aria-label="Open on Hipages"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpenDetail(job)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      title="Job details"
                      aria-label="Job details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
