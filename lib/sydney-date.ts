/**
 * Date helpers in Australia/Sydney timezone for analytics and date range.
 * Ensures "today" and presets (Last 7/30/90 days) align with Sydney.
 */

const TIMEZONE = "Australia/Sydney";

/** Current date in Sydney as YYYY-MM-DD */
export function getTodayInSydney(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/** Date in Sydney that is `daysOffset` days from today (e.g. -7 for 7 days ago). Returns YYYY-MM-DD. */
export function getDateInSydneyOffset(daysOffset: number): string {
  const today = getTodayInSydney();
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + daysOffset);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

/** Format YYYY-MM-DD for display in Sydney (e.g. "7 Feb 2026"). */
export function formatDisplayDateSydney(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-AU", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
