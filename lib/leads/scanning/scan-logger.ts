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

/**
 * Log a scan stage with key-value data. One line per call.
 */
export function logScan(stage: string, data: Record<string, unknown>): void {
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
