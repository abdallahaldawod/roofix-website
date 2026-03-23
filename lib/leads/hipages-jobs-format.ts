import type { HipagesJob } from "./hipages-jobs-types";

function timeMsFromFs(ts: { seconds: number } | undefined): number {
  if (!ts || typeof ts.seconds !== "number") return 0;
  return ts.seconds * 1000;
}

/** Sort / compare: last sync time in ms */
export function getHipagesJobSyncTimeMs(job: HipagesJob): number {
  return Math.max(
    timeMsFromFs(job.updatedAt),
    timeMsFromFs(job.syncedAt),
    timeMsFromFs(job.createdAt)
  );
}

/** Sort / compare: posted time in ms */
export function getHipagesJobPostedTimeMs(job: HipagesJob): number {
  const fromFs = timeMsFromFs(job.postedAt);
  if (fromFs > 0) return fromFs;
  if (job.postedAtIso) {
    const d = new Date(job.postedAtIso);
    const t = d.getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function formatHipagesJobCost(job: HipagesJob): string {
  if (job.leadCost && job.leadCost.trim()) return job.leadCost.trim();
  if (job.leadCostCredits != null && Number.isFinite(job.leadCostCredits)) {
    return `${job.leadCostCredits} credits`;
  }
  return "—";
}

export function formatHipagesJobPosted(job: HipagesJob): string {
  if (job.postedAtText?.trim()) return job.postedAtText.trim();
  if (job.postedAtIso) {
    const d = new Date(job.postedAtIso);
    if (!Number.isNaN(d.getTime())) {
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
  const ts = job.postedAt;
  if (ts) {
    return new Date(ts.seconds * 1000).toLocaleString("en-AU", {
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

export function formatHipagesJobLastSync(job: HipagesJob): string {
  const pick = job.updatedAt ?? job.syncedAt ?? job.createdAt;
  if (!pick) return "—";
  return new Date(pick.seconds * 1000).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function suburbPostcodeLine(job: HipagesJob): string {
  const parts = [job.suburb, job.postcode].filter((x) => x && String(x).trim());
  return parts.length > 0 ? parts.join(" ") : "—";
}
