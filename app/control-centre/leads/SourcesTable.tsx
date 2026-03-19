"use client";

import { Pencil, Pause, Play, FlaskConical, Trash2, Link2, Loader2, Info } from "lucide-react";
import type { LeadSource } from "@/lib/leads/types";
import { StatusBadge, ModeBadge, AuthStatusBadge, ScanStatusBadge } from "./Badge";

function displayPlatform(source: LeadSource): string {
  if (source.isSystem) return source.platform || "System";
  return source.platform && source.platform !== "external" ? source.platform : "External";
}

function displayType(source: LeadSource): string {
  if (source.isSystem) return source.type || "website";
  return source.type && source.type !== "external" ? source.type : "External";
}

type SourcesTableProps = {
  sources: LeadSource[];
  /** When true, scanner has at least one source to scan (worker is running cycles). When false, worker sleeps (paused). */
  scannerStatus?: "Running" | "Paused";
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onRunTest: (id: string) => void;
  onDelete?: (id: string) => void;
  onConnect?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  connectingSourceId?: string | null;
};

function formatLastScan(ts: LeadSource["lastScanAt"]): string {
  if (!ts) return "Never";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatLastAuth(ts: LeadSource["lastAuthAt"]): string {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function SourcesTable({
  sources,
  scannerStatus = "Paused",
  onEdit,
  onPause,
  onRunTest,
  onDelete,
  onConnect,
  onViewDetails,
  connectingSourceId,
}: SourcesTableProps) {
  const scannerLabel = scannerStatus === "Running" ? "Running" : "Paused";
  const scannerStyle =
    scannerStatus === "Running"
      ? "bg-emerald-50 text-emerald-800"
      : "bg-neutral-100 text-neutral-600";
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      {/* Mobile: card list */}
      <div className="space-y-3 p-4 md:hidden">
        {sources.map((source) => (
          <div
            key={source.id}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900">
                  {source.name}
                  {source.isSystem && (
                    <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                      System
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  {displayPlatform(source)} · {displayType(source)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={source.status} />
                  <ModeBadge mode={source.mode} />
                  <span className="text-xs text-neutral-500">
                    Last scan: {formatLastScan(source.lastScanAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Today: {source.matchedToday} new lead{source.matchedToday === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {onViewDetails && (
                  <button
                    type="button"
                    aria-label="View source details"
                    onClick={() => onViewDetails(source.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <Info className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Edit"
                  onClick={() => onEdit(source.id)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={source.status === "Active" ? "Pause" : "Activate"}
                  onClick={() => onPause(source.id)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {source.status === "Active" ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>
                {!source.isSystem && (
                  <button
                    type="button"
                    aria-label="Run test"
                    onClick={() => onRunTest(source.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <FlaskConical className="h-5 w-5" />
                  </button>
                )}
                {onDelete && !source.isSystem && (
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => onDelete(source.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            {!source.isSystem && (
              <div className="mt-3 border-t border-neutral-100 pt-2">
                <AuthStatusBadge
                  authStatus={source.authStatus}
                  lastAuthError={source.lastAuthError}
                />
                {onConnect &&
                  (connectingSourceId === source.id ? (
                    <span className="ml-2 text-xs text-neutral-500">Connecting…</span>
                  ) : source.authStatus === "failed" || source.authStatus === "needs_reconnect" ? (
                    <button
                      type="button"
                      onClick={() => onConnect(source.id)}
                      className="ml-2 min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Reconnect
                    </button>
                  ) : source.authStatus !== "connected" ? (
                    <button
                      type="button"
                      onClick={() => onConnect(source.id)}
                      className="ml-2 min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Connect Source
                    </button>
                  ) : null)}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-neutral-100">
          <thead className="bg-neutral-50/80">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Source Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Platform
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Type
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Mode
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Rule Set
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Auth
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Last Scan
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                New leads today
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Scanner
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {sources.map((source) => (
              <tr key={source.id} className="text-sm">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-neutral-900">
                  <span className="inline-flex items-center gap-2">
                    {source.name}
                    {source.isSystem && (
                      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                        System
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{displayPlatform(source)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{displayType(source)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={source.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ModeBadge mode={source.mode} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                  {source.ruleSetName || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {source.isSystem ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5">
                        <AuthStatusBadge
                          authStatus={source.authStatus}
                          lastAuthError={source.lastAuthError}
                        />
                        {source.lastAuthAt && (
                          <span className="text-xs text-neutral-500">
                            {formatLastAuth(source.lastAuthAt)}
                          </span>
                        )}
                      </span>
                      {(source.authStatus === "failed" ||
                        source.authStatus === "needs_reconnect") &&
                        source.lastAuthError && (
                          <span
                            className="max-w-[220px] truncate text-xs text-red-600"
                            title={source.lastAuthError}
                          >
                            {source.lastAuthError}
                          </span>
                        )}
                      {onConnect &&
                        (connectingSourceId === source.id ? (
                          <button
                            type="button"
                            disabled
                            className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                          >
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Connecting…
                          </button>
                        ) : source.authStatus === "failed" ||
                          source.authStatus === "needs_reconnect" ? (
                          <button
                            type="button"
                            onClick={() => onConnect(source.id)}
                            className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                          >
                            <Link2 className="h-3 w-3" />
                            Reconnect
                          </button>
                        ) : source.authStatus !== "connected" ? (
                          <button
                            type="button"
                            onClick={() => onConnect(source.id)}
                            className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                          >
                            <Link2 className="h-3 w-3" />
                            Connect Source
                          </button>
                        ) : null)}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-neutral-700">
                      {formatLastScan(source.lastScanAt)}
                      {!source.isSystem &&
                        source.lastScanDurationMs != null &&
                        source.lastScanDurationMs > 0 && (
                          <span className="text-xs text-neutral-500">
                            in {(source.lastScanDurationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                    </span>
                    {!source.isSystem && (
                      <ScanStatusBadge
                        lastScanStatus={source.lastScanStatus}
                        lastScanError={source.lastScanError}
                        isScanning={false}
                        lastScanFailedImport={source.lastScanFailedImport}
                        lastScanFailedExtraction={source.lastScanFailedExtraction}
                      />
                    )}
                    {source.isSystem && source.lastScanStatus && source.lastScanStatus !== "idle" && (
                      <span
                        className={`max-w-[180px] truncate text-xs ${
                          source.lastScanStatus === "success"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {source.lastScanStatus === "success" ? "Success" : "Failed"}
                      </span>
                    )}
                    {!source.isSystem &&
                      (source.lastScanStatus === "failed" ||
                        source.lastScanStatus === "needs_reconnect") &&
                      source.lastScanError && (
                        <span
                          className="max-w-[220px] truncate text-xs text-red-600"
                          title={source.lastScanError}
                        >
                          {source.lastScanError}
                        </span>
                      )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                  <span className="text-xs">
                    Today: {source.matchedToday} new lead{source.matchedToday === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scannerStyle}`}
                    title={
                      scannerStatus === "Running"
                        ? "Scanner has active sources and is running"
                        : "No active sources; scanner is paused"
                    }
                  >
                    {scannerLabel}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {onViewDetails && (
                      <button
                        type="button"
                        aria-label="View source details"
                        onClick={() => onViewDetails(source.id)}
                        className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Edit"
                      onClick={() => onEdit(source.id)}
                      className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={source.status === "Active" ? "Pause" : "Activate"}
                      onClick={() => onPause(source.id)}
                      className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      {source.status === "Active" ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    {!source.isSystem && (
                      <button
                        type="button"
                        aria-label="Run test"
                        onClick={() => onRunTest(source.id)}
                        className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <FlaskConical className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && !source.isSystem && (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => onDelete(source.id)}
                        className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
