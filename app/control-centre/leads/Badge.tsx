"use client";

import type { LeadSourceStatus, LeadSourceMode } from "@/lib/leads/types";

type SourceStatus = LeadSourceStatus;
type SourceMode = LeadSourceMode;

type StatusBadgeProps = {
  status: SourceStatus;
};

const STATUS_STYLES: Record<SourceStatus, string> = {
  Active: "bg-emerald-50 text-emerald-800",
  Paused: "bg-neutral-100 text-neutral-600",
  Error: "bg-red-50 text-red-800",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

type ModeBadgeProps = {
  mode: SourceMode;
};

const MODE_STYLES: Record<SourceMode, string> = {
  Manual: "bg-neutral-100 text-neutral-600",
  "Dry Run": "bg-amber-50 text-amber-800",
  Live: "bg-emerald-50 text-emerald-800",
};

export function ModeBadge({ mode }: ModeBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${MODE_STYLES[mode]}`}
    >
      {mode}
    </span>
  );
}

const AUTH_STATUS_LABELS: Record<string, string> = {
  not_connected: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  failed: "Failed",
  needs_reconnect: "Needs reconnect",
};

const AUTH_STATUS_STYLES: Record<string, string> = {
  not_connected: "bg-neutral-100 text-neutral-600",
  connecting: "bg-amber-50 text-amber-800",
  connected: "bg-emerald-50 text-emerald-800",
  failed: "bg-red-50 text-red-800",
  needs_reconnect: "bg-amber-50 text-amber-800",
};

type AuthStatusBadgeProps = {
  authStatus?: string | null;
  /** Shown as tooltip when status is Failed; optional. */
  lastAuthError?: string | null;
};

export function AuthStatusBadge({ authStatus, lastAuthError }: AuthStatusBadgeProps) {
  const status = authStatus && AUTH_STATUS_LABELS[authStatus] ? authStatus : "not_connected";
  const label = AUTH_STATUS_LABELS[status] ?? "Not connected";
  const style = AUTH_STATUS_STYLES[status] ?? AUTH_STATUS_STYLES.not_connected;
  const title =
    (status === "failed" || status === "needs_reconnect") && lastAuthError
      ? lastAuthError
      : label;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
      title={title}
    >
      {label}
    </span>
  );
}

/** Last scan status for external sources: idle, success, partial, failed, needs_reconnect. */
const SCAN_STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  success: "Success",
  partial: "Partial",
  failed: "Failed",
  needs_reconnect: "Needs reconnect",
};

const SCAN_STATUS_STYLES: Record<string, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  success: "bg-emerald-50 text-emerald-800",
  partial: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-800",
  needs_reconnect: "bg-amber-50 text-amber-800",
};

type ScanStatusBadgeProps = {
  lastScanStatus?: string | null;
  lastScanError?: string | null;
  /** When true, show as "Scanning…" with loading style. */
  isScanning?: boolean;
  /** When success with some failed imports/extractions, show Partial. */
  lastScanFailedImport?: number;
  lastScanFailedExtraction?: number;
};

export function ScanStatusBadge({
  lastScanStatus,
  lastScanError,
  isScanning,
  lastScanFailedImport = 0,
  lastScanFailedExtraction = 0,
}: ScanStatusBadgeProps) {
  if (isScanning) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
        Scanning…
      </span>
    );
  }
  const hasPartial =
    lastScanStatus === "success" &&
    (lastScanFailedImport > 0 || lastScanFailedExtraction > 0);
  const status = hasPartial
    ? "partial"
    : lastScanStatus && SCAN_STATUS_LABELS[lastScanStatus]
      ? lastScanStatus
      : "idle";
  const label = SCAN_STATUS_LABELS[status] ?? "Idle";
  const style = SCAN_STATUS_STYLES[status] ?? SCAN_STATUS_STYLES.idle;
  const title =
    (status === "failed" || status === "needs_reconnect") && lastScanError
      ? lastScanError
      : label;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
      title={title}
    >
      {label}
    </span>
  );
}
