/**
 * Load Hipages jobs via control-centre API (Admin SDK) — fallback when client Firestore rules deny hipages_jobs.
 */

import type { HipagesJob } from "./hipages-jobs-types";

export type FetchHipagesJobsApiResult =
  | { ok: true; jobs: HipagesJob[] }
  | { ok: false; status: number; error: string };

export async function fetchHipagesJobsFromApi(token: string): Promise<FetchHipagesJobsApiResult> {
  const res = await fetch("/api/control-centre/leads/hipages-jobs", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    jobs?: HipagesJob[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data.error === "string" ? data.error : "Request failed",
    };
  }
  return { ok: true, jobs: Array.isArray(data.jobs) ? data.jobs : [] };
}
