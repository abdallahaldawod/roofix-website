/**
 * Display helpers for HipagesJob rows (UI only).
 */

import type { HipagesJob } from "./hipages-jobs-types";

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parsePostedAtText(text: string): number | null {
  const fullMatch = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s*[-–,]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (fullMatch) {
    const [, day, mon, year, hr, min, ampm] = fullMatch;
    const month = MONTH_MAP[mon!.toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    let hour = parseInt(hr!, 10);
    if (ampm!.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (ampm!.toLowerCase() === "am" && hour === 12) hour = 0;
    const d = new Date(parseInt(year!, 10), month, parseInt(day!, 10), hour, parseInt(min!, 10));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const relMatch = text.match(/^(today|yesterday)[,\s]+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (relMatch) {
    const [, rel, hr, min, ampm] = relMatch;
    const base = new Date();
    if (rel!.toLowerCase() === "yesterday") base.setDate(base.getDate() - 1);
    let hour = parseInt(hr!, 10);
    if (ampm!.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (ampm!.toLowerCase() === "am" && hour === 12) hour = 0;
    base.setHours(hour, parseInt(min!, 10), 0, 0);
    return isNaN(base.getTime()) ? null : base.getTime();
  }
  return null;
}

/** Milliseconds for “last sync” sort: prefers syncedAt, then scannedAt. */
export function getHipagesJobSyncTimeMs(job: HipagesJob): number {
  const s = job.syncedAt?.seconds ?? 0;
  const sc = job.scannedAt?.seconds ?? 0;
  return Math.max(s, sc) * 1000;
}

export function formatHipagesJobCost(job: HipagesJob): string {
  if (job.leadCost && String(job.leadCost).trim() !== "") return String(job.leadCost).trim();
  if (job.leadCostCredits != null && Number.isFinite(job.leadCostCredits)) return `${job.leadCostCredits} credits`;
  return "—";
}

export function formatHipagesJobPosted(job: HipagesJob): string {
  if (job.postedAtText) return job.postedAtText;
  if (job.postedAtIso) {
    const d = new Date(job.postedAtIso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  }
  if (job.postedAt?.seconds) {
    return new Date(job.postedAt.seconds * 1000).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return "—";
}

export function getHipagesJobPostedTimeMs(job: HipagesJob): number {
  if (job.postedAtText) {
    const ms = parsePostedAtText(job.postedAtText);
    if (ms !== null) return ms;
  }
  if (job.postedAtIso) {
    const ms = new Date(job.postedAtIso).getTime();
    if (!isNaN(ms)) return ms;
  }
  if (job.postedAt?.seconds) return job.postedAt.seconds * 1000;
  return 0;
}

export function formatHipagesJobLastSync(job: HipagesJob): string {
  const ms = getHipagesJobSyncTimeMs(job);
  if (ms <= 0) return "—";
  return new Date(ms).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function suburbPostcodeLine(job: HipagesJob): string {
  const parts = [job.suburb].filter(Boolean);
  if (job.postcode) parts.push(job.postcode);
  return parts.join(" / ") || "—";
}
