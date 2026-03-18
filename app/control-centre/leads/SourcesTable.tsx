"use client";

import { Pencil, Pause, FlaskConical, Trash2, Link2, Loader2, Search, Info } from "lucide-react";
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
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onRunTest: (id: string) => void;
  onDelete?: (id: string) => void;
  onConnect?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  connectingSourceId?: string | null;
  onScanNow?: (id: string) => void;
  scanningSourceId?: string | null;
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
  onEdit,
  onPause,
  onRunTest,
  onDelete,
  onConnect,
  onViewDetails,
  connectingSourceId,
  onScanNow,
  scanningSourceId,
}: SourcesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
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
                Results Today
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
                      {source.authStatus === "failed" && source.lastAuthError && (
                        <span
                          className="max-w-[200px] truncate text-xs text-red-600"
                          title={source.lastAuthError}
                        >
                          {source.lastAuthError}
                        </span>
                      )}
                      {onConnect && (
                        <button
                          type="button"
                          disabled={connectingSourceId === source.id}
                          onClick={() => onConnect(source.id)}
                          className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                          {connectingSourceId === source.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Connecting…
                            </>
                          ) : source.authStatus === "connected" ||
                            source.authStatus === "failed" ||
                            source.authStatus === "needs_reconnect" ? (
                            <>
                              <Link2 className="h-3 w-3" />
                              Reconnect
                            </>
                          ) : (
                            <>
                              <Link2 className="h-3 w-3" />
                              Connect Source
                            </>
                          )}
                        </button>
                      )}
                      {onScanNow && source.authStatus === "connected" && (
                        <button
                          type="button"
                          disabled={scanningSourceId === source.id}
                          onClick={() => onScanNow(source.id)}
                          className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                          {scanningSourceId === source.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Scanning…
                            </>
                          ) : (
                            <>
                              <Search className="h-3 w-3" />
                              Scan Now
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-neutral-700">
                      {formatLastScan(source.lastScanAt)}
                    </span>
                    {!source.isSystem && (
                      <ScanStatusBadge
                        lastScanStatus={source.lastScanStatus}
                        lastScanError={source.lastScanError}
                        isScanning={scanningSourceId === source.id}
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
                      source.lastScanStatus === "failed" &&
                      source.lastScanError && (
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-red-600" title={source.lastScanError}>
                          {source.lastScanError}
                        </p>
                      )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                  {source.scannedToday} scanned / {source.matchedToday} matched
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {onViewDetails && (
                      <button
                        type="button"
                        aria-label="View source details"
                        onClick={() => onViewDetails(source.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Edit"
                      onClick={() => onEdit(source.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Pause"
                      onClick={() => onPause(source.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                    {!source.isSystem && (
                      <button
                        type="button"
                        aria-label="Run test"
                        onClick={() => onRunTest(source.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <FlaskConical className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && !source.isSystem && (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => onDelete(source.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-red-50 hover:text-red-700"
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
