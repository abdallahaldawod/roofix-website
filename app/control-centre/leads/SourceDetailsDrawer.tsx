"use client";

import { useState, useEffect } from "react";
import {
  X,
  Link2,
  Pencil,
  Pause,
  Trash2,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ScanText,
} from "lucide-react";
import type { LeadSource, ScanRun } from "@/lib/leads/types";
import { StatusBadge, ModeBadge, AuthStatusBadge, ScanStatusBadge } from "./Badge";

function formatTime(ts: LeadSource["lastScanAt"] | LeadSource["lastAuthAt"]): string {
  if (!ts) return "—";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function truncateUrl(url: string, maxLen: number): string {
  if (!url) return "—";
  return url.length <= maxLen ? url : url.slice(0, maxLen - 3) + "…";
}

function formatScanRunTime(ts: { seconds: number; nanoseconds: number }): string {
  return new Date(ts.seconds * 1000).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type SourceDetailsDrawerProps = {
  source: LeadSource | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onConnect: (id: string) => void;
  /** Run Analyze Page for this source (connected only). */
  onAnalyzePage?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Fetch recent scan runs for diagnostics. */
  onFetchScanRuns?: (sourceId: string) => Promise<ScanRun[]>;
  connectingSourceId: string | null;
  analyzingSourceId: string | null;
  /** Base path for links, e.g. /control-centre */
  basePath: string;
};

export function SourceDetailsDrawer({
  source,
  onClose,
  onEdit,
  onPause,
  onConnect,
  onAnalyzePage,
  onDelete,
  onFetchScanRuns,
  connectingSourceId,
  analyzingSourceId,
  basePath,
}: SourceDetailsDrawerProps) {
  const [scanRuns, setScanRuns] = useState<ScanRun[]>([]);
  const [loadingScanRuns, setLoadingScanRuns] = useState(false);
  const [debugSnippetOpen, setDebugSnippetOpen] = useState(false);

  useEffect(() => {
    if (!source?.id || !onFetchScanRuns) return;
    setLoadingScanRuns(true);
    onFetchScanRuns(source.id)
      .then(setScanRuns)
      .catch(() => setScanRuns([]))
      .finally(() => setLoadingScanRuns(false));
  }, [source?.id, onFetchScanRuns]);

  if (!source) return null;

  const isConnecting = connectingSourceId === source.id;
  const isScanning = false;
  const isAnalyzing = analyzingSourceId === source.id;
  const debug = source.lastScanDebug;
  const needsReconnect =
    source.authStatus === "needs_reconnect" || source.lastScanStatus === "needs_reconnect";
  const canScan = source.authStatus === "connected" && !source.isSystem;
  const showReconnect =
    source.authStatus === "connected" ||
    source.authStatus === "failed" ||
    source.authStatus === "needs_reconnect";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:max-w-lg"
        role="dialog"
        aria-labelledby="source-drawer-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="source-drawer-title" className="text-lg font-semibold text-neutral-900">
              {source.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {source.isSystem && (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                  System
                </span>
              )}
              <StatusBadge status={source.status} />
              <ModeBadge mode={source.mode} />
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

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Needs Reconnect banner */}
          {needsReconnect && !source.isSystem && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Session expired or connection lost
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Reconnect this source to run scans and import leads.
              </p>
              <button
                type="button"
                disabled={isConnecting}
                onClick={() => onConnect(source.id)}
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Reconnect Source
                  </>
                )}
              </button>
            </div>
          )}

          {/* Connection / Auth */}
          {!source.isSystem && (
            <section className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Connection
              </h3>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AuthStatusBadge
                    authStatus={source.authStatus}
                    lastAuthError={source.lastAuthError}
                  />
                  {source.lastAuthAt && (
                    <span className="text-xs text-neutral-500">
                      Last connected: {formatTime(source.lastAuthAt)}
                    </span>
                  )}
                </div>
                {source.lastAuthError && source.authStatus === "failed" && (
                  <p
                    className="mt-2 flex items-start gap-2 text-xs text-red-700"
                    title={source.lastAuthError}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words">{source.lastAuthError}</span>
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Last scan summary */}
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Last Scan
            </h3>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ScanStatusBadge
                  lastScanStatus={source.lastScanStatus}
                  lastScanError={source.lastScanError}
                  isScanning={isScanning}
                  lastScanFailedImport={source.lastScanFailedImport}
                  lastScanFailedExtraction={source.lastScanFailedExtraction}
                />
                {source.lastScanAt && !isScanning && (
                  <span className="text-xs text-neutral-500">
                    {formatTime(source.lastScanAt)}
                    {source.lastScanDurationMs != null && source.lastScanDurationMs > 0 && (
                      <> · {(source.lastScanDurationMs / 1000).toFixed(1)}s</>
                    )}
                  </span>
                )}
              </div>
              {source.lastScanError &&
                (source.lastScanStatus === "failed" ||
                  source.lastScanStatus === "needs_reconnect") &&
                !isScanning && (
                  <p
                    className="mt-2 flex items-start gap-2 text-xs text-red-700"
                    title={source.lastScanError}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words">{source.lastScanError}</span>
                  </p>
                )}
              {/* Scan counts */}
              {(typeof source.lastScanExtracted === "number" ||
                typeof source.lastScanImported === "number" ||
                typeof source.lastScanDuplicate === "number" ||
                typeof source.lastScanFailedExtraction === "number" ||
                typeof source.lastScanFailedImport === "number") && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {typeof source.lastScanExtracted === "number" && (
                    <>
                      <dt className="text-neutral-500">Extracted</dt>
                      <dd className="tabular-nums font-medium text-neutral-900">
                        {source.lastScanExtracted}
                      </dd>
                    </>
                  )}
                  {typeof source.lastScanImported === "number" && (
                    <>
                      <dt className="text-neutral-500">Imported</dt>
                      <dd className="tabular-nums font-medium text-emerald-700">
                        {source.lastScanImported}
                      </dd>
                    </>
                  )}
                  {typeof source.lastScanDuplicate === "number" && (
                    <>
                      <dt className="text-neutral-500">Duplicates skipped</dt>
                      <dd className="tabular-nums font-medium text-neutral-700">
                        {source.lastScanDuplicate}
                      </dd>
                    </>
                  )}
                  {typeof source.lastScanFailedExtraction === "number" && (
                    <>
                      <dt className="text-neutral-500">Extraction failed</dt>
                      <dd className="tabular-nums font-medium text-amber-700">
                        {source.lastScanFailedExtraction}
                      </dd>
                    </>
                  )}
                  {typeof source.lastScanFailedImport === "number" && (
                    <>
                      <dt className="text-neutral-500">Import failed</dt>
                      <dd className="tabular-nums font-medium text-amber-700">
                        {source.lastScanFailedImport}
                      </dd>
                    </>
                  )}
                </dl>
              )}
              <div className="mt-3 flex gap-4 text-xs text-neutral-600">
                <span>Today: {source.matchedToday} new lead{source.matchedToday === 1 ? "" : "s"}</span>
              </div>
            </div>
          </section>

          {/* Configuration summary */}
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Configuration
            </h3>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-neutral-500">Rule set</dt>
                  <dd className="font-medium text-neutral-900">
                    {source.ruleSetName || "—"}
                  </dd>
                </div>
                {!source.isSystem && source.leadsUrl && (
                  <div>
                    <dt className="text-neutral-500">Leads URL</dt>
                    <dd
                      className="font-mono text-xs text-neutral-700 break-all"
                      title={source.leadsUrl}
                    >
                      {truncateUrl(source.leadsUrl, 50)}
                    </dd>
                  </div>
                )}
                {!source.isSystem && (
                  <div>
                    <dt className="text-neutral-500">Extraction</dt>
                    <dd className="font-medium text-neutral-900">
                      {source.extractionConfig?.leadCardSelector
                        ? "Configured"
                        : "Not configured"}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Last run debug (diagnostics) */}
          {!source.isSystem && debug && (debug.pageUrl ?? debug.pageTitle ?? debug.leadCardCount != null) && (
            <section className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Last run diagnostics
              </h3>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                <dl className="space-y-1.5 text-sm">
                  {debug.pageUrl && (
                    <div>
                      <dt className="text-neutral-500">Page URL</dt>
                      <dd className="break-all font-mono text-xs text-neutral-700" title={debug.pageUrl}>
                        {truncateUrl(debug.pageUrl, 60)}
                      </dd>
                    </div>
                  )}
                  {debug.pageTitle && (
                    <div>
                      <dt className="text-neutral-500">Page title</dt>
                      <dd className="truncate text-neutral-900" title={debug.pageTitle}>
                        {debug.pageTitle}
                      </dd>
                    </div>
                  )}
                  {typeof debug.leadCardCount === "number" && (
                    <div>
                      <dt className="text-neutral-500">Lead cards found</dt>
                      <dd className="tabular-nums font-medium text-neutral-900">
                        {debug.leadCardCount}
                      </dd>
                    </div>
                  )}
                  {debug.snippet && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setDebugSnippetOpen((o) => !o)}
                        className="flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                      >
                        {debugSnippetOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Raw snippet (debug)
                      </button>
                      {debugSnippetOpen && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded border border-neutral-200 bg-white p-2 text-xs text-neutral-700 whitespace-pre-wrap break-words">
                          {debug.snippet}
                        </pre>
                      )}
                    </div>
                  )}
                </dl>
              </div>
            </section>
          )}

          {/* Recent scans */}
          {!source.isSystem && onFetchScanRuns && (
            <section className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Recent scans
              </h3>
              {loadingScanRuns ? (
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : scanRuns.length === 0 ? (
                <p className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-sm text-neutral-500">
                  No scan history yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {scanRuns.map((run) => (
                    <li
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm"
                    >
                      <span className="text-neutral-600">
                        {formatScanRunTime(run.startedAt)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          run.status === "success"
                            ? "bg-emerald-50 text-emerald-800"
                            : run.status === "needs_reconnect"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-red-50 text-red-800"
                        }`}
                      >
                        {run.status}
                      </span>
                      {(run.imported != null || run.extracted != null) && (
                        <span className="tabular-nums text-neutral-500">
                          {run.imported ?? 0} imported
                          {run.extracted != null ? ` / ${run.extracted} extracted` : ""}
                        </span>
                      )}
                      {run.errorMessage && run.status !== "success" && (
                        <p className="w-full truncate text-xs text-red-600" title={run.errorMessage}>
                          {run.errorMessage}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* View leads from this source */}
          {!source.isSystem && (
            <section className="mb-6">
              <a
                href={`${basePath}/leads?source=${encodeURIComponent(source.name)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <ExternalLink className="h-4 w-4" />
                View leads from this source
              </a>
            </section>
          )}
        </div>

        {/* Actions footer */}
        <div className="border-t border-neutral-200 bg-neutral-50/50 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {!source.isSystem && (
              <>
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => onConnect(source.id)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {showReconnect ? "Reconnect" : "Connect"}
                </button>
                {canScan && (
                  <>
                    {onAnalyzePage && (
                      <button
                        type="button"
                        disabled={isAnalyzing || isScanning}
                        onClick={() => onAnalyzePage(source.id)}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ScanText className="h-4 w-4" />
                        )}
                        Analyze Page
                      </button>
                    )}
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => onEdit(source.id)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onPause(source.id)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Pause className="h-4 w-4" />
              {source.status === "Active" ? "Pause" : "Activate"}
            </button>
            {onDelete && !source.isSystem && (
              <button
                type="button"
                onClick={() => onDelete(source.id)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
