/**
 * Structured logging for the lead action queue worker.
 * One-line logs for action_queue_found, action_processing_started, action_processing_success, action_processing_failed.
 */

const PREFIX = "[action-queue]";

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

export function logActionQueue(
  stage:
    | "action_queue_found"
    | "action_processing_started"
    | "action_processing_success"
    | "action_processing_failed",
  data: {
    actionId?: string;
    sourceId?: string;
    leadId?: string;
    actionType?: string;
    error?: string;
    resultSummary?: string;
  }
): void {
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
