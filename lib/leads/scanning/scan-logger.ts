/**
 * Structured logging for scan and extraction stages.
 * Single-line, readable logs for diagnostics without noise.
 */

const PREFIX = "[scan]";

function formatValue(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** When set, emit all scan stages; otherwise only key stages are logged (see ALWAYS_LOG_STAGES). */
const SCAN_DEBUG = process.env.LEADS_SCAN_DEBUG === "1" || process.env.SCANNER_DEBUG === "1";

/** Stages that are always logged so operators see new imports, cycle summary, Hipages two-pass timing, and total wall time without full debug. */
const ALWAYS_LOG_STAGES = new Set([
  "scan_failed",
  "lead_imported",
  "import_done",
  "scan_done",
  "fast_path_started",
  "fast_path_evaluated",
  "fast_path_action_triggered",
  "fast_path_action_duration_ms",
  "full_scan_duration_ms",
  "fast_path_total_duration_ms",
]);

/**
 * Log a scan stage with key-value data. One line per call.
 * Always emits: scan_failed, lead_imported, import_done, scan_done (end-to-end duration_ms), and Hipages fast-path timing stages (see ALWAYS_LOG_STAGES).
 * When SCAN_DEBUG is set, emits all other stages too.
 */
export function logScan(stage: string, data: Record<string, unknown>): void {
  if (!SCAN_DEBUG && !ALWAYS_LOG_STAGES.has(stage)) return;
  const parts = [PREFIX, `stage=${stage}`];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const formatted = formatValue(value);
    if (formatted.length > 200) {
      parts.push(`${key}=${formatted.slice(0, 200)}…`);
    } else {
      parts.push(`${key}=${formatted}`);
    }
  }
  console.log(parts.join(" "));
}
