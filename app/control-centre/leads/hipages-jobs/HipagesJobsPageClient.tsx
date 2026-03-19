"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Search, ArrowUpDown, Settings } from "lucide-react";
import { useControlCentreBase } from "../../use-base-path";
import { PushNotifySubscribe } from "../../PushNotifySubscribe";
import { subscribeToHipagesJobs } from "@/lib/leads/hipages-jobs-subscribe";
import type { HipagesJob } from "@/lib/leads/hipages-jobs-types";
import { getSources } from "@/lib/leads/sources";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { fetchHipagesJobsFromApi } from "@/lib/leads/hipages-jobs-api-client";
import { pickFirstHipagesJobsSource } from "@/lib/leads/hipages-jobs-source-pick";
import {
  getHipagesJobSyncTimeMs,
  getHipagesJobPostedTimeMs,
} from "@/lib/leads/hipages-jobs-format";
import { HipagesJobsTable } from "./HipagesJobsTable";
import { HipagesJobDetailModal } from "./HipagesJobDetailModal";

type SortMode = "synced_desc" | "synced_asc" | "posted_desc" | "posted_asc";

export function HipagesJobsPageClient() {
  const base = useControlCentreBase();
  const [jobs, setJobs] = useState<HipagesJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("synced_desc");
  const [detailJob, setDetailJob] = useState<HipagesJob | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [serverPollMode, setServerPollMode] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeFirestore: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const clearPoll = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setServerPollMode(false);

    const auth = getFirebaseAuth();

    void (async () => {
      await auth.authStateReady();
      if (cancelled) return;
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        setError("Sign in required");
        return;
      }
      await user.getIdToken(true);
      if (cancelled) return;

      unsubscribeFirestore = subscribeToHipagesJobs(
        (data) => {
          if (cancelled) return;
          clearPoll();
          setServerPollMode(false);
          setJobs(data);
          setLoading(false);
          setError(null);
          setErrorCode(null);
        },
        (err) => {
          if (cancelled) return;
          const fe = err instanceof FirebaseError ? err.code : "not_firebase_error";

          if (fe === "permission-denied") {
            unsubscribeFirestore?.();
            unsubscribeFirestore = undefined;
            setServerPollMode(true);
            setError(null);
            setErrorCode(null);

            const loadViaApi = async () => {
              try {
                const t = await getFirebaseAuth().currentUser?.getIdToken();
                if (!t || cancelled) return;
                const result = await fetchHipagesJobsFromApi(t);
                if (cancelled) return;
                if (result.ok) {
                  setJobs(result.jobs);
                  setLoading(false);
                } else {
                  setLoading(false);
                  setError(result.error);
                  setServerPollMode(false);
                  clearPoll();
                }
              } catch {
                if (cancelled) return;
                setLoading(false);
                setError("Could not load Hipages jobs from server");
                setServerPollMode(false);
                clearPoll();
              }
            };

            void loadViaApi();
            pollTimer = setInterval(() => {
              void loadViaApi();
            }, 15000);
          } else {
            setError(err.message);
            setErrorCode(fe);
            setLoading(false);
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      clearPoll();
      unsubscribeFirestore?.();
    };
  }, []);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const s = j.jobStatus?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filtered = useMemo(() => {
    let list = jobs;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((j) => {
        const hay = [
          j.customerName,
          j.title,
          j.suburb,
          j.postcode,
          j.description,
          j.jobId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterStatus) {
      list = list.filter((j) => (j.jobStatus ?? "").trim() === filterStatus);
    }
    return list;
  }, [jobs, search, filterStatus]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortMode === "synced_desc" || sortMode === "synced_asc") {
        const da = getHipagesJobSyncTimeMs(a);
        const db = getHipagesJobSyncTimeMs(b);
        return sortMode === "synced_desc" ? db - da : da - db;
      }
      const pa = getHipagesJobPostedTimeMs(a);
      const pb = getHipagesJobPostedTimeMs(b);
      return sortMode === "posted_desc" ? pb - pa : pa - pb;
    });
    return copy;
  }, [filtered, sortMode]);

  const getToken = useCallback(async (): Promise<string> => {
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, []);

  const runSync = useCallback(async () => {
    setSyncInProgress(true);
    setSyncHint(null);
    try {
      const sources = await getSources();
      const hipagesSource = pickFirstHipagesJobsSource(sources);
      if (!hipagesSource) {
        setSyncHint(
          "No eligible Hipages source found. Use an Active source with a saved session and “Hipages” in the name or platform, or a hipages.com URL in Leads URL."
        );
        return;
      }
      const token = await getToken();
      const res = await fetch("/api/control-centre/leads/import-hipages-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId: hipagesSource.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        jobs_list_found_count?: number;
        jobs_saved_count?: number;
        saved?: number;
      };

      if (!res.ok || !data.ok) {
        setSyncHint(typeof data.error === "string" ? data.error : `Sync failed (HTTP ${res.status})`);
        return;
      }

      setLastSyncAt(Date.now());

      // Refresh table via Admin API so rows appear even if the browser listener lags or rules differ.
      const refreshed = await fetchHipagesJobsFromApi(token);
      if (refreshed.ok) {
        setJobs(refreshed.jobs);
      }

      const listed = data.jobs_list_found_count ?? 0;
      const saved = data.jobs_saved_count ?? data.saved ?? 0;
      if (listed === 0) {
        setSyncHint("Sync completed: no jobs found on your Hipages jobs list.");
      } else if (!refreshed.ok) {
        setSyncHint(
          `Sync succeeded on the server but refreshing the table failed: ${refreshed.error}. Check Admin SDK / FIREBASE_SERVICE_ACCOUNT_KEY for the API route.`
        );
      } else if (refreshed.jobs.length === 0) {
        setSyncHint(
          `Sync reported ${saved} job(s) saved but the list is still empty. Deploy Firestore rules for hipages_jobs or use Server mode (amber banner).`
        );
      } else {
        setSyncHint(null);
      }
    } catch (e) {
      setSyncHint(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncInProgress(false);
    }
  }, [getToken]);

  const selectClass =
    "min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

  return (
    <div className="min-w-0 space-y-6">
      <header className="border-b border-neutral-200 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">Hipages jobs</h1>
            <p className="mt-2 text-neutral-600 sm:text-base">
              Live jobs from Firestore (<code className="rounded bg-neutral-100 px-1 text-sm">hipages_jobs</code>). Sync
              from Lead Management to refresh.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PushNotifySubscribe />
            <Link
              href={(base || "/control-centre") + "/leads"}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Leads inbox
            </Link>
            <Link
              href={(base || "/control-centre") + "/leads/management"}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
            >
              <Settings className="h-4 w-4" />
              Lead Management
            </Link>
          </div>
        </div>
      </header>

      {serverPollMode ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
          role="status"
        >
          <p className="font-medium">Server mode (rules still block browser reads)</p>
          <p className="mt-1 text-amber-900/90">
            Data loads through the control-centre API and refreshes about every 15 seconds. Deploy{" "}
            <code className="rounded bg-amber-100/80 px-1 text-xs">firestore.rules</code> (
            <code className="rounded bg-amber-100/80 px-1 text-xs">hipages_jobs</code> + admin) for instant Firestore
            sync in the browser.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Customer, title, suburb…"
                className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Job status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={selectClass}
            >
              <option value="synced_desc">Newest sync first</option>
              <option value="synced_asc">Oldest sync first</option>
              <option value="posted_desc">Newest posted first</option>
              <option value="posted_asc">Oldest posted first</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runSync}
              disabled={syncInProgress}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {syncInProgress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUpDown className="h-4 w-4" aria-hidden />}
              Sync jobs
            </button>
            {lastSyncAt ? (
              <span className="text-xs text-neutral-500">
                Last sync trigger {Math.floor((Date.now() - lastSyncAt) / 1000)}s ago
              </span>
            ) : null}
          </div>
        </div>
        {syncHint ? (
          <p className="mt-3 text-sm text-neutral-700" role="status">
            {syncHint}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          <span className="ml-3 text-sm text-neutral-500">Loading Hipages jobs…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-16 shadow-sm">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
          {errorCode === "permission-denied" ? (
            <div className="mt-4 max-w-lg rounded-lg border border-red-200 bg-white/80 px-4 py-3 text-left text-sm text-red-900">
              <p className="font-medium">Firestore access to `hipages_jobs`</p>
              <p className="mt-2 text-red-800">
                You’re signed in as an admin, but this project’s <strong>deployed</strong> security rules may not include the{" "}
                <code className="rounded bg-red-100 px-1 text-xs">hipages_jobs</code> collection yet. The rules file in this repo
                already allows admins to read it — deploy them to Firebase:
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 px-3 py-2 text-xs text-neutral-100">
                npm run deploy:rules
              </pre>
              <p className="mt-2 text-xs text-red-700">
                Or: <code className="rounded bg-red-100 px-1">npx firebase-tools deploy --only firestore:rules</code>
              </p>
            </div>
          ) : null}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-16 shadow-sm">
          <p className="text-center text-base font-medium text-neutral-900">No Hipages jobs synced yet</p>
          <p className="mt-2 max-w-md text-center text-sm text-neutral-600">
            Sync jobs to load data from your Hipages account. Connect a Hipages source in Lead Management, then use{" "}
            <strong>Sync jobs</strong> above.
          </p>
          <button
            type="button"
            onClick={runSync}
            disabled={syncInProgress}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
          >
            {syncInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sync jobs
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <HipagesJobsTable jobs={sorted} onOpenDetail={setDetailJob} />
        </div>
      )}

      <HipagesJobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />
    </div>
  );
}
