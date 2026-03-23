import type { HipagesJob } from "./hipages-jobs-types";

export async function fetchHipagesJobsFromApi(
  token: string
): Promise<{ ok: true; jobs: HipagesJob[] } | { ok: false; error: string }> {
  const res = await fetch("/api/control-centre/leads/hipages-jobs", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    jobs?: HipagesJob[];
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
    };
  }
  if (!data.ok || !Array.isArray(data.jobs)) {
    return { ok: false, error: "Invalid response from server" };
  }
  return { ok: true, jobs: data.jobs };
}
