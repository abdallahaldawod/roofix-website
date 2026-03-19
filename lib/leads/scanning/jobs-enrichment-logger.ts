/**
 * Structured logging for Hipages jobs detail enrichment.
 * One line per call, key=value style for grep-friendly logs.
 */

const PREFIX = "[jobs-enrichment]";

function formatValue(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return v.message;
  if (Array.isArray(v)) return v.join(",");
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const DEBUG = process.env.LEADS_JOBS_ENRICHMENT_DEBUG === "1";
const ALWAYS_STAGES = new Set([
  "jobs_detail_enrichment_failed",
  "customer_enquiry_enrichment_failed",
  "jobs_enrichment_updated",
]);

/**
 * Log an enrichment stage. Always logs failures and jobs_enrichment_updated.
 * When LEADS_JOBS_ENRICHMENT_DEBUG=1, logs all stages.
 */
export function logJobsEnrichment(stage: string, data: Record<string, unknown>): void {
  if (!DEBUG && !ALWAYS_STAGES.has(stage)) return;
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
