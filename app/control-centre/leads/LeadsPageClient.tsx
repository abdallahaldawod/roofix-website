"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Search, Eye, Loader2, AlertCircle, Settings, Trash2, ChevronUp, ChevronDown, Check, Zap } from "lucide-react";
import { useControlCentreBase } from "../use-base-path";
import { PushNotifySubscribe } from "../PushNotifySubscribe";
import { StatCard } from "./StatCard";
import { ActivityLeadModal } from "./ActivityLeadModal";
import { subscribeToActivity, deleteActivity, deleteActivities } from "@/lib/leads/activity";
import { getSources } from "@/lib/leads/sources";
import { getRuleSets } from "@/lib/leads/rule-sets";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  subscribeToLeadActionQueue,
  getActionStatus,
  type ActionStatusByLeadAndAction,
  type LeadActionStatus,
} from "@/lib/leads/action-queue-client";
import { subscribeToSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/leads/settings";
import type { LeadActivity, LeadDecision, LeadActivityStatus, LeadRuleSet, LeadSource } from "@/lib/leads/types";

const HIPAGES_CREDIT_CACHE_TTL_MS = 60_000;
let hipagesCreditCache: { value: string | null; error: string | null; at: number } | null = null;
let hipagesCreditInFlight: Promise<{ value: string | null; error: string | null }> | null = null;

const DECISION_STYLES: Record<LeadDecision, string> = {
  Accept: "bg-emerald-50 text-emerald-800",
  Review: "bg-amber-50 text-amber-800",
  Reject: "bg-red-50 text-red-800",
};

const ACTIVITY_STATUS_STYLES: Record<LeadActivityStatus, string> = {
  Scanned: "bg-neutral-100 text-neutral-600",
  Processed: "bg-emerald-50 text-emerald-800",
  Failed: "bg-red-50 text-red-800",
};

function DecisionBadge({ decision }: { decision: LeadDecision }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[decision]}`}
    >
      {decision}
    </span>
  );
}

function ActivityStatusBadge({ status }: { status: LeadActivityStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVITY_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse hipages postedAtText strings into milliseconds (local time).
 * Handles formats like:
 *   "17th Mar 2026 - 6:55 pm"
 *   "Today, 6:17am"
 *   "Yesterday, 3:00pm"
 * Returns null when the string can't be parsed (e.g. "3h ago").
 */
function parsePostedAtText(text: string): number | null {
  // Format: "17th Mar 2026 - 6:55 pm" or "17 Mar 2026 - 6:55 pm"
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
  // Format: "Today, 6:17am" / "Yesterday, 3:00pm"
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

function formatReceivedDate(lead: LeadActivity): string {
  // Priority 1: raw visible text from the platform (e.g. "Today, 6:17pm") — exact as hipages shows it.
  if (lead.postedAtText) return lead.postedAtText;
  // Priority 2: raw ISO string parsed client-side — browser applies its own timezone, no server offset guessing.
  if (lead.postedAtIso) {
    const d = new Date(lead.postedAtIso);
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
  // Fallback: scannedAt (import time).
  const ts = lead.scannedAt;
  if (!ts) return "—";
  return new Date(ts.seconds * 1000).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatReasons(reasons: string[] | undefined): string {
  if (!reasons?.length) return "—";
  return reasons.slice(0, 2).join("; ") + (reasons.length > 2 ? "…" : "");
}

/** Display string for lead cost (leadCost string or "X credits" from leadCostCredits). */
function formatLeadCost(lead: LeadActivity): string {
  if (lead.leadCost && lead.leadCost.trim() !== "") return lead.leadCost;
  if (lead.leadCostCredits != null && Number.isFinite(lead.leadCostCredits)) return `${lead.leadCostCredits} credits`;
  return "—";
}

function suburbPostcode(lead: LeadActivity): string {
  const parts = [lead.suburb].filter(Boolean);
  if (lead.postcode) parts.push(lead.postcode);
  return parts.join(" / ") || "—";
}

function deriveAcceptPathForTesting(lead: LeadActivity): string | null {
  const direct = lead.hipagesActions?.accept?.trim();
  if (direct) return direct;
  const fallback =
    lead.hipagesActions?.decline?.trim() ||
    lead.hipagesActions?.waitlist?.trim();
  if (!fallback) return null;
  const m = fallback.match(/^\/leads\/([^/]+)\/(accept|decline|waitlist)(?:\?.*)?$/);
  if (!m?.[1]) return null;
  return `/leads/${m[1]}/accept`;
}

/** Parse leadCost to a number for sorting (e.g. "$12.50" → 12.5, "30 credits" → 30, "Free" → 0). Missing/invalid → null. */
function parseLeadCostToNumber(leadCost: string | null | undefined): number | null {
  if (leadCost == null || typeof leadCost !== "string") return null;
  const t = leadCost.trim();
  if (/^free$/i.test(t)) return 0;
  const dollar = /^\$(\d+(?:\.\d+)?)$/.exec(t);
  if (dollar) return parseFloat(dollar[1]);
  const credits = /^(\d+(?:\.\d+)?)\s+credits?$/i.exec(t);
  if (credits) return parseFloat(credits[1]);
  return null;
}

/** Posted time in ms for sorting (uses same priority as formatReceivedDate). */
function getPostedTimeMs(lead: LeadActivity): number {
  if (lead.postedAtText) {
    const ms = parsePostedAtText(lead.postedAtText);
    if (ms !== null) return ms;
  }
  if (lead.postedAtIso) {
    const ms = new Date(lead.postedAtIso).getTime();
    if (!isNaN(ms)) return ms;
  }
  if (lead.postedAt?.seconds) return lead.postedAt.seconds * 1000;
  return (lead.scannedAt?.seconds ?? 0) * 1000;
}

export type LeadsPageClientProps = { searchParams: Record<string, string | string[] | undefined> | null };

export function LeadsPageClient(props: LeadsPageClientProps) {
  const base = useControlCentreBase();
  const resolvedSearchParams = props.searchParams;
  const sourceFromUrl =
    resolvedSearchParams && "source" in resolvedSearchParams && resolvedSearchParams.source != null
      ? Array.isArray(resolvedSearchParams.source)
        ? resolvedSearchParams.source[0]
        : resolvedSearchParams.source
      : null;
  const [leads, setLeads] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [hipagesActingId, setHipagesActingId] = useState<string | null>(null);
  /** When action fails, store the API error message (and optional step) for display. */
  const [hipagesActionError, setHipagesActionError] = useState<Record<string, string>>({});
  /** Real-time queue status per lead and action (pending → processing → success/failed). */
  const [actionStatusByLeadAndAction, setActionStatusByLeadAndAction] = useState<ActionStatusByLeadAndAction>({});
  /** UI-level pending actions stay loading until the lead row reflects the result. */
  const [pendingActionKeys, setPendingActionKeys] = useState<Set<string>>(new Set());
  const [fetchCustomerLeadId, setFetchCustomerLeadId] = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [lastLeadsUpdateAt, setLastLeadsUpdateAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [hipagesCredit, setHipagesCredit] = useState<string | null>(null);
  const [hipagesCreditError, setHipagesCreditError] = useState<string | null>(null);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [ruleSets, setRuleSets] = useState<LeadRuleSet[]>([]);
  const [autoApplyRulesEnabled, setAutoApplyRulesEnabled] = useState<boolean>(DEFAULT_SETTINGS.automationEnabled);
  const [autoApplyRulesLoading, setAutoApplyRulesLoading] = useState(true);
  const [autoApplyRulesSaving, setAutoApplyRulesSaving] = useState(false);

  type SortBy = "cost" | "posted";
  const [sortBy, setSortBy] = useState<SortBy>("posted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const queueActionKey = useCallback(
    (leadId: string, action: "accept" | "decline" | "waitlist") => `${leadId}:${action}`,
    []
  );

  // Apply ?source= from URL (e.g. from "View leads from this source")
  useEffect(() => {
    if (sourceFromUrl) setFilterSource(decodeURIComponent(sourceFromUrl));
  }, [sourceFromUrl]);

  // Realtime subscription: table updates on any add/update/delete in lead_activity (e.g. after each local scan).
  const previousLeadCountRef = useRef<number>(0);
  const [newLeadsBanner, setNewLeadsBanner] = useState<number | null>(null);
  useEffect(() => {
    setLoading(true);
    setError(null);
    previousLeadCountRef.current = 0;
    const unsubscribe = subscribeToActivity(
      (data) => {
        const prevCount = previousLeadCountRef.current;
        previousLeadCountRef.current = data.length;
        setLeads(data);
        setLastLeadsUpdateAt(Date.now());
        setLoading(false);
        if (prevCount > 0 && data.length > prevCount) {
          const added = data.length - prevCount;
          setNewLeadsBanner(added);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [retryCount]);

  // Load sources (execution mode) and rule sets (Reject → Decline trigger test).
  useEffect(() => {
    getSources().then(setSources).catch(() => setSources([]));
    getRuleSets().then(setRuleSets).catch(() => setRuleSets([]));
  }, []);

  // Global automation toggle (same as Lead Management "Automation" — lead_settings/global.automationEnabled).
  useEffect(() => {
    setAutoApplyRulesLoading(true);
    const unsub = subscribeToSettings(
      (settings) => {
        setAutoApplyRulesEnabled(settings.automationEnabled);
        setAutoApplyRulesLoading(false);
      },
      () => setAutoApplyRulesLoading(false)
    );
    return unsub;
  }, []);

  // Real-time subscription to lead action queue so we show pending/processing/success/failed.
  useEffect(() => {
    const leadIds = leads.map((l) => l.id);
    if (leadIds.length === 0) {
      setActionStatusByLeadAndAction({});
      return;
    }
    const unsubscribe = subscribeToLeadActionQueue(
      leadIds,
      setActionStatusByLeadAndAction,
      () => {}
    );
    return () => unsubscribe();
  }, [leads]);

  useEffect(() => {
    if (pendingActionKeys.size === 0) return;
    setPendingActionKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const key of prev) {
        const [leadId, actionRaw] = key.split(":");
        if (!leadId || (actionRaw !== "accept" && actionRaw !== "decline" && actionRaw !== "waitlist")) continue;
        const action = actionRaw as "accept" | "decline" | "waitlist";
        const status = getActionStatus(actionStatusByLeadAndAction, leadId, action);
        if (status?.status === "failed") {
          next.delete(key);
          changed = true;
          continue;
        }
        if (status?.status !== "success") continue;
        const lead = leads.find((l) => l.id === leadId);
        // Keep loading until the row reflects the success (button path removed) or row disappears.
        const actionStillVisible =
          action === "accept"
            ? !!lead?.hipagesActions?.accept
            : action === "decline"
              ? !!lead?.hipagesActions?.decline
              : !!lead?.hipagesActions?.waitlist;
        if (!lead || !actionStillVisible) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pendingActionKeys, actionStatusByLeadAndAction, leads]);

  useEffect(() => {
    if (newLeadsBanner === null) return;
    const t = setTimeout(() => setNewLeadsBanner(null), 5000);
    return () => clearTimeout(t);
  }, [newLeadsBanner]);

  const getToken = useCallback(async (): Promise<string> => {
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, []);

  // Fetch hipages credit once on mount (business.hipages.com.au). Silent: no loading state; previous value stays until new data arrives.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = Date.now();
        if (hipagesCreditCache && now - hipagesCreditCache.at < HIPAGES_CREDIT_CACHE_TTL_MS) {
          if (!cancelled) {
            setHipagesCredit(hipagesCreditCache.value);
            setHipagesCreditError(hipagesCreditCache.error);
          }
          return;
        }
        if (!hipagesCreditInFlight) {
          hipagesCreditInFlight = (async () => {
            const token = await getToken();
            const res = await fetch("/api/control-centre/leads/hipages-credit", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            const result =
              data.ok === true && typeof data.credit === "string"
                ? { value: data.credit as string, error: null }
                : { value: null, error: (typeof data.error === "string" ? data.error : "Failed to load") };
            hipagesCreditCache = { ...result, at: Date.now() };
            return result;
          })().finally(() => {
            hipagesCreditInFlight = null;
          });
        }
        const result = await hipagesCreditInFlight;
        if (cancelled) return;
        setHipagesCredit(result.value);
        setHipagesCreditError(result.error);
      } catch {
        if (!cancelled) setHipagesCreditError("Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const toggleAutoApplyRules = useCallback(async () => {
    if (autoApplyRulesSaving) return;
    const nextValue = !autoApplyRulesEnabled;
    setAutoApplyRulesSaving(true);
    setAutoApplyRulesEnabled(nextValue);
    try {
      await saveSettings({ automationEnabled: nextValue });
    } catch {
      setAutoApplyRulesEnabled((prev) => !prev);
    } finally {
      setAutoApplyRulesSaving(false);
    }
  }, [autoApplyRulesEnabled, autoApplyRulesSaving]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      await deleteActivity(id, token);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } finally {
      setDeletingId(null);
    }
  }, [getToken]);

  const handleFetchCustomer = useCallback(
    async (leadId: string, sourceId: string): Promise<{ ok: boolean; error?: string; _debug?: Record<string, unknown> }> => {
      try {
        const token = await getToken();
        const res = await fetch("/api/control-centre/leads/fetch-hipages-job", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId, leadId }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error ?? "Request failed" };
        return { ok: data.ok === true, error: data.error, _debug: data._debug };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
      }
    },
    [getToken]
  );

  const handleHipagesAction = useCallback(
    async (lead: LeadActivity, action: "accept" | "decline" | "waitlist", actionPath: string) => {
      if (hipagesActingId) return;
      const key = queueActionKey(lead.id, action);
      setPendingActionKeys((prev) => new Set(prev).add(key));
      setHipagesActingId(`${lead.id}-${action}`);
      setHipagesActionError((prev) => ({ ...prev, [lead.id]: "" }));
      try {
        const token = await getToken();
        const res = await fetch("/api/control-centre/leads/action-queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId: lead.sourceId, actionPath, action, leadId: lead.id }),
        });
        const data = await res.json();
        const ok = data.ok === true;
        if (!ok) {
          const errMsg = typeof data.error === "string" ? data.error : "Could not queue action";
          setHipagesActionError((prev) => ({ ...prev, [lead.id]: errMsg }));
          setPendingActionKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        } else {
          // Keep queued state until queue status + row update clear the pending key.
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Could not queue action";
        setHipagesActionError((prev) => ({ ...prev, [lead.id]: errMsg }));
        setPendingActionKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } finally {
        setHipagesActingId(null);
      }
    },
    [hipagesActingId, getToken, queueActionKey]
  );

  const handleBulkDelete = useCallback(async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Delete ${checkedIds.size} lead${checkedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getToken();
      await deleteActivities([...checkedIds], token);
      setLeads((prev) => prev.filter((l) => !checkedIds.has(l.id)));
      setCheckedIds(new Set());
    } finally {
      setBulkDeleting(false);
    }
  }, [checkedIds, getToken]);

  /** Button label and disabled for a given lead and queue action (accept/decline/waitlist). */
  const getQueueActionButton = useCallback(
    (
      leadId: string,
      action: "accept" | "decline" | "waitlist",
      optimisticQueued: boolean
    ): { label: string; disabled: boolean; title?: string } => {
      const status = getActionStatus(actionStatusByLeadAndAction, leadId, action);
      const loading = hipagesActingId === `${leadId}-${action}`;
      const disabled =
        !!hipagesActingId ||
        status?.status === "pending" ||
        status?.status === "processing";
      if (loading) return { label: "Queuing…", disabled: true };
      if (status?.status === "pending") return { label: "Pending…", disabled: true, title: "Pending local execution" };
      if (status?.status === "processing") return { label: "Processing…", disabled: true, title: "Running on local worker" };
      if (status?.status === "success") {
        const done =
          action === "accept" ? "Accepted" : action === "decline" ? "Declined" : "Waitlisted";
        return { label: done, disabled: false, title: `${action} succeeded` };
      }
      if (status?.status === "failed") {
        const short = status.error ? (status.error.length > 35 ? `${status.error.slice(0, 35)}…` : status.error) : "Failed";
        return { label: `Failed: ${short}`, disabled: false, title: status.error ?? "Action failed" };
      }
      if (optimisticQueued) return { label: "Updating…", disabled: true, title: "Waiting for table update" };
      return { label: action === "accept" ? "Accept" : action === "decline" ? "Decline" : "Waitlist", disabled: false };
    },
    [actionStatusByLeadAndAction, hipagesActingId]
  );

  const isActionPendingUi = useCallback(
    (leadId: string, action: "accept" | "decline" | "waitlist") =>
      pendingActionKeys.has(queueActionKey(leadId, action)),
    [pendingActionKeys, queueActionKey]
  );

  const shouldShowActionSpinner = useCallback(
    (leadId: string, action: "accept" | "decline" | "waitlist", label: string) =>
      hipagesActingId === `${leadId}-${action}` ||
      label === "Queuing…" ||
      label === "Pending…" ||
      label === "Processing…" ||
      label === "Updating…",
    [hipagesActingId]
  );

  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const canQueueActionsForLead = useCallback(
    (sourceId: string) => (sourcesById.get(sourceId)?.executionMode ?? "local_execute") !== "scan_only",
    [sourcesById]
  );

  /** Queue Decline for the single checked lead — same action-queue path as row Decline; optional rule-set check vs Reject trigger. */
  const handleTestAutoDeclineTrigger = useCallback(async () => {
    if (checkedIds.size !== 1) {
      window.alert("Select exactly one lead, then use Trigger to test the auto decline path.");
      return;
    }
    const [leadId] = [...checkedIds];
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) {
      window.alert("That lead is not loaded. Clear filters or select a lead from the list.");
      return;
    }
    if (!canQueueActionsForLead(lead.sourceId)) {
      window.alert("Decline cannot be queued for this source (execution mode is Scan only).");
      return;
    }
    const declinePath = lead.hipagesActions?.decline?.trim();
    if (!declinePath) {
      window.alert("This lead has no hipages Decline link (it may already be acted on).");
      return;
    }
    if (hipagesActingId) return;

    const source = sourcesById.get(lead.sourceId);
    const ruleSet = source?.ruleSetId
      ? ruleSets.find((r) => r.id === source.ruleSetId)
      : undefined;
    const rejectTrigger = ruleSet?.triggerPlatformActions?.reject ?? undefined;

    if (rejectTrigger === "decline") {
      await handleHipagesAction(lead, "decline", declinePath);
      return;
    }
    if (rejectTrigger != null) {
      const ok = window.confirm(
        `Rule set Reject trigger is “${rejectTrigger}”, not Decline. Queue Decline anyway (same queue as manual Decline)?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        "No platform action is set for Reject on this source’s rule set. Queue Decline anyway to test the worker?"
      );
      if (!ok) return;
    }
    await handleHipagesAction(lead, "decline", declinePath);
  }, [
    checkedIds,
    leads,
    canQueueActionsForLead,
    hipagesActingId,
    sourcesById,
    ruleSets,
    handleHipagesAction,
  ]);

  /** Queue Accept for the single checked lead — same action-queue path as row Accept; optional rule-set check vs Accept trigger. */
  const handleTestAutoAcceptTrigger = useCallback(async () => {
    if (checkedIds.size !== 1) {
      window.alert("Select exactly one lead, then use Trigger Accept to test the auto accept path.");
      return;
    }
    const [leadId] = [...checkedIds];
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) {
      window.alert("That lead is not loaded. Clear filters or select a lead from the list.");
      return;
    }
    if (!canQueueActionsForLead(lead.sourceId)) {
      window.alert("Accept cannot be queued for this source (execution mode is Scan only).");
      return;
    }
    const acceptPath = deriveAcceptPathForTesting(lead);
    if (!acceptPath) {
      window.alert("This lead has no usable hipages action path to derive Accept.");
      return;
    }
    if (hipagesActingId) return;

    const source = sourcesById.get(lead.sourceId);
    const ruleSet = source?.ruleSetId
      ? ruleSets.find((r) => r.id === source.ruleSetId)
      : undefined;
    const acceptTrigger = ruleSet?.triggerPlatformActions?.accept ?? undefined;

    if (acceptTrigger === "accept") {
      await handleHipagesAction(lead, "accept", acceptPath);
      return;
    }
    if (acceptTrigger != null) {
      const ok = window.confirm(
        `Rule set Accept trigger is “${acceptTrigger}”, not Accept. Queue Accept anyway (same queue as manual Accept)?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        "No platform action is set for Accept on this source’s rule set. Queue Accept anyway to test the worker?"
      );
      if (!ok) return;
    }
    await handleHipagesAction(lead, "accept", acceptPath);
  }, [
    checkedIds,
    leads,
    canQueueActionsForLead,
    hipagesActingId,
    sourcesById,
    ruleSets,
    handleHipagesAction,
  ]);

  const singleCheckedLead = useMemo(() => {
    if (checkedIds.size !== 1) return null;
    const id = [...checkedIds][0];
    return leads.find((l) => l.id === id) ?? null;
  }, [checkedIds, leads]);

  const testDeclineTriggerEnabled =
    !!singleCheckedLead &&
    canQueueActionsForLead(singleCheckedLead.sourceId) &&
    !!singleCheckedLead.hipagesActions?.decline?.trim() &&
    !hipagesActingId &&
    !bulkDeleting;

  const testAcceptTriggerEnabled =
    !!singleCheckedLead &&
    canQueueActionsForLead(singleCheckedLead.sourceId) &&
    !!deriveAcceptPathForTesting(singleCheckedLead) &&
    !hipagesActingId &&
    !bulkDeleting;

  const testDeclineTriggerTitle = (() => {
    if (checkedIds.size === 0) return "Select a lead with the checkbox";
    if (checkedIds.size > 1) return "Select exactly one lead";
    if (!singleCheckedLead) return "Lead not in current list — clear filters";
    if (!canQueueActionsForLead(singleCheckedLead.sourceId)) return "Source is Scan only — change execution mode in Lead Management";
    if (!singleCheckedLead.hipagesActions?.decline?.trim()) return "No Decline action on this lead";
    if (hipagesActingId) return "Wait for the current action to finish";
    if (bulkDeleting) return "Wait for delete to finish";
    return "Queue Decline for the selected lead (same path as automation when Reject → Decline)";
  })();

  const testAcceptTriggerTitle = (() => {
    if (checkedIds.size === 0) return "Select a lead with the checkbox";
    if (checkedIds.size > 1) return "Select exactly one lead";
    if (!singleCheckedLead) return "Lead not in current list — clear filters";
    if (!canQueueActionsForLead(singleCheckedLead.sourceId)) return "Source is Scan only — change execution mode in Lead Management";
    if (!deriveAcceptPathForTesting(singleCheckedLead)) return "No usable hipages action path on this lead";
    if (hipagesActingId) return "Wait for the current action to finish";
    if (bulkDeleting) return "Wait for delete to finish";
    return "Queue Accept for testing (direct accept when available, otherwise derived from lead action path)";
  })();

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

  const totalToday = leads.length;
  const accepted = leads.filter((l) => l.decision === "Accept").length;
  const rejected = leads.filter((l) => l.decision === "Reject").length;
  const review = leads.filter((l) => l.decision === "Review").length;
  const failed = leads.filter((l) => l.status === "Failed").length;

  const leadsForView = useMemo(
    () => leads.filter((l) => l.platformAccepted !== true),
    [leads]
  );

  const filtered = useMemo(() => {
    return leadsForView.filter((lead) => {
      if (filterSource && lead.sourceName !== filterSource) return false;
      if (filterDecision && lead.decision !== filterDecision) return false;
      if (filterStatus && lead.status !== filterStatus) return false;
      if (filterDate) {
        const leadDate = lead.scannedAt
          ? new Date(lead.scannedAt.seconds * 1000).toISOString().slice(0, 10)
          : "";
        if (leadDate !== filterDate) return false;
      }
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (
          !lead.title.toLowerCase().includes(q) &&
          !(lead.description ?? "").toLowerCase().includes(q) &&
          !lead.suburb.toLowerCase().includes(q) &&
          !lead.sourceName.toLowerCase().includes(q) &&
          !(lead.postcode ?? "").toLowerCase().includes(q) &&
          !(lead.customerName ?? "").toLowerCase().includes(q) &&
          !(lead.email ?? "").toLowerCase().includes(q) &&
          !(lead.phone ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [leadsForView, filterSource, filterDecision, filterStatus, filterDate, filterSearch]);

  useEffect(() => {
  }, [leads, leadsForView, filtered, filterSource, filterDecision, filterStatus, filterDate, filterSearch]);

  const statusOrder: Record<string, number> = { Processed: 0, Scanned: 1, Failed: 2 };
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const statusA = statusOrder[a.status] ?? 3;
      const statusB = statusOrder[b.status] ?? 3;
      if (statusA !== statusB) return statusA - statusB;
      if (sortBy === "cost") {
        const na = a.leadCostCredits != null ? a.leadCostCredits : parseLeadCostToNumber(a.leadCost) ?? Infinity;
        const nb = b.leadCostCredits != null ? b.leadCostCredits : parseLeadCostToNumber(b.leadCost) ?? Infinity;
        return sortDir === "asc" ? na - nb : nb - na;
      }
      const ma = getPostedTimeMs(a);
      const mb = getPostedTimeMs(b);
      return sortDir === "asc" ? ma - mb : mb - ma;
    });
  }, [filtered, sortBy, sortDir]);

  const handleSortCost = () => {
    if (sortBy === "cost") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy("cost");
      setSortDir("asc"); // cheapest first
    }
  };
  const handleSortPosted = () => {
    if (sortBy === "posted") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy("posted");
      setSortDir("desc"); // newest first by default
    }
  };

  const allVisibleIds = sorted.map((l) => l.id);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => checkedIds.has(id));
  const someChecked = !allChecked && allVisibleIds.some((id) => checkedIds.has(id));

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setCheckedIds((prev) => new Set([...prev, ...allVisibleIds]));
    }
  };

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const uniqueSources = useMemo(() => Array.from(new Set(leads.map((l) => l.sourceName))), [leads]);
  const selectClass =
    "min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading leads...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-16 shadow-sm">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setLoading(true);
            setRetryCount((c) => c + 1);
          }}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <header className="border-b border-neutral-200 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Leads
            </h1>
            <p className="mt-2 text-neutral-600 sm:text-base">
              Your lead inbox from all sources
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PushNotifySubscribe />
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

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Leads Today" value={totalToday} />
        <StatCard title="Accepted" value={accepted} />
        <StatCard title="Rejected" value={rejected} />
        <StatCard title="Review" value={review} />
        <StatCard title="Failed" value={failed} />
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className={selectClass}
            >
              <option value="">All Sources</option>
              {uniqueSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Decision</label>
            <select
              value={filterDecision}
              onChange={(e) => setFilterDecision(e.target.value)}
              className={selectClass}
            >
              <option value="">All Decisions</option>
              <option value="Accept">Accept</option>
              <option value="Review">Review</option>
              <option value="Reject">Reject</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={selectClass}
            >
              <option value="">All Statuses</option>
              <option value="Scanned">Scanned</option>
              <option value="Processed">Processed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">From</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className={selectClass}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search leads..."
                className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: credit + scan status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-neutral-700">New leads inbox</p>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <button
            type="button"
            disabled={autoApplyRulesLoading || autoApplyRulesSaving}
            onClick={toggleAutoApplyRules}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              autoApplyRulesEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
            title="Toggle auto apply rules"
            aria-label={`Auto apply rules ${autoApplyRulesEnabled ? "on" : "off"}`}
          >
            {autoApplyRulesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {autoApplyRulesLoading
              ? "Auto apply rules…"
              : autoApplyRulesEnabled
                ? "Auto apply rules: On"
                : "Auto apply rules: Off"}
          </button>
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-1.5 text-xs"
            aria-hidden="true"
          >
            <span className="font-medium text-neutral-500">HiPages</span>
            {hipagesCreditError ? (
              <span className="font-semibold tabular-nums text-neutral-400" title={hipagesCreditError}>
                —
              </span>
            ) : hipagesCredit ? (
              <span className="font-semibold tabular-nums text-neutral-900">{hipagesCredit}</span>
            ) : (
              <span className="font-semibold tabular-nums text-neutral-400">—</span>
            )}
          </div>
          <span className="max-w-md text-xs text-neutral-600">
            Scanning is handled locally by the worker (<code className="rounded bg-neutral-100 px-1">npm run scanner-worker</code>).
          </span>
          {newLeadsBanner != null && newLeadsBanner > 0 && (
            <span className="text-xs font-medium text-emerald-600">
              {newLeadsBanner === 1 ? "1 new lead imported" : `${newLeadsBanner} new leads imported`}
            </span>
          )}
          <span className="text-xs text-neutral-500" aria-hidden="true">
            {lastLeadsUpdateAt
              ? (() => {
                  const secs = Math.floor((Date.now() - lastLeadsUpdateAt) / 1000);
                  if (secs < 60) return secs <= 5 ? "Last updated just now" : `Last updated ${secs}s ago`;
                  const mins = Math.floor(secs / 60);
                  if (mins === 1) return "Last updated 1 min ago";
                  return `Last updated ${mins} min ago`;
                })()
              : "Last updated —"}
          </span>
        </div>
      </div>

      {/* Leads table or empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-16 shadow-sm">
          {leads.length === 0 ? (
            <>
              <p className="text-center text-base font-medium text-neutral-900">No leads yet</p>
              <p className="mt-2 max-w-md text-center text-sm text-neutral-600">
                New leads from Hipages appear here after the local scanner imports them. Run{" "}
                <code className="rounded bg-neutral-100 px-1 text-xs">npm run scanner-worker</code> on a machine with your
                saved session, or connect a source in Lead Management first.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={(base || "/control-centre") + "/leads/management"}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Settings className="h-4 w-4" />
                  Lead Management
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-base font-medium text-neutral-900">No leads match your filters</p>
              <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
                Try changing the source, decision, status, date, or search.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterSource("");
                  setFilterDecision("");
                  setFilterStatus("");
                  setFilterDate("");
                  setFilterSearch("");
                }}
                className="mt-4 min-h-[44px] rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          {/* Bulk action bar */}
          {checkedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
              <span className="text-sm font-medium text-neutral-700">
                {checkedIds.size} selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!testAcceptTriggerEnabled}
                  title={testAcceptTriggerTitle}
                  onClick={() => void handleTestAutoAcceptTrigger()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  Trigger Accept
                </button>
                <button
                  type="button"
                  disabled={!testDeclineTriggerEnabled}
                  title={testDeclineTriggerTitle}
                  onClick={() => void handleTestAutoDeclineTrigger()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  Trigger Decline
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete selected
                </button>
              </div>
            </div>
          )}
          {/* Mobile: card list */}
          <div className="space-y-3 p-4 md:hidden">
            {sorted.map((lead) => (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 ${checkedIds.has(lead.id) ? "border-neutral-300 bg-neutral-50" : "border-neutral-200 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center pt-0.5">
                    <input
                      type="checkbox"
                      aria-label={`Select lead ${lead.customerName || lead.sourceName || lead.id}`}
                      checked={checkedIds.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="h-5 w-5 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DecisionBadge decision={lead.decision} />
                      <ActivityStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-1.5 font-medium text-neutral-900">
                      {lead.customerName || lead.email || lead.phone || lead.sourceName || "—"}
                    </p>
                    {lead.customerName && (lead.email || lead.phone) && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        {[lead.email, lead.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {lead.sourceName} · {suburbPostcode(lead)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Score {lead.score} · {formatLeadCost(lead)} · {formatReceivedDate(lead)}
                    </p>
                    {lead.reasons?.length ? (
                      <p className="mt-1 truncate text-xs text-neutral-600">{formatReasons(lead.reasons)}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3">
                  {hipagesActionError[lead.id] && (
                    <span className="text-xs text-red-600">{hipagesActionError[lead.id]}</span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {lead.sourceName?.toLowerCase().includes("hipages") &&
                      canQueueActionsForLead(lead.sourceId) &&
                      (lead.hipagesActions?.accept || lead.hipagesActions?.decline || lead.hipagesActions?.waitlist) && (
                        <>
                          {/* When accept label is "Join Waitlist", treat as waitlist: orange styling and send action "waitlist" so worker runs popup + Share my details. */}
                          {lead.hipagesActions.accept && (() => {
                            const isJoinWaitlist = /join\s*waitlist/i.test(lead.hipagesActions.acceptLabel ?? "");
                            const action: "accept" | "waitlist" = isJoinWaitlist ? "waitlist" : "accept";
                            const btn = getQueueActionButton(lead.id, action, isActionPendingUi(lead.id, action));
                            const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, action)?.status === "success";
                            const label = lead.hipagesActions.acceptLabel ?? btn.label;
                            const actionPath = lead.hipagesActions!.accept!;
                            const isOrange = isJoinWaitlist;
                            return (
                              <button
                                type="button"
                                disabled={btn.disabled}
                                onClick={() => handleHipagesAction(lead, action, actionPath)}
                                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? (isOrange ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100") : isOrange ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
                                title={btn.title}
                                aria-label={label}
                              >
                                {shouldShowActionSpinner(lead.id, action, btn.label) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : isSuccess ? (
                                  <Check className="h-4 w-4" aria-hidden />
                                ) : null}
                                {label}
                              </button>
                            );
                          })()}
                          {lead.hipagesActions.decline && (() => {
                            const btn = getQueueActionButton(lead.id, "decline", isActionPendingUi(lead.id, "decline"));
                            const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, "decline")?.status === "success";
                            const label = lead.hipagesActions.declineLabel ?? btn.label;
                            return (
                              <button
                                type="button"
                                disabled={btn.disabled}
                                onClick={() => handleHipagesAction(lead, "decline", lead.hipagesActions!.decline!)}
                                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100" : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"}`}
                                title={btn.title}
                                aria-label={label}
                              >
                                {shouldShowActionSpinner(lead.id, "decline", btn.label) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : isSuccess ? (
                                  <Check className="h-4 w-4" aria-hidden />
                                ) : null}
                                {label}
                              </button>
                            );
                          })()}
                          {lead.hipagesActions.waitlist && (() => {
                            const btn = getQueueActionButton(lead.id, "waitlist", isActionPendingUi(lead.id, "waitlist"));
                            const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, "waitlist")?.status === "success";
                            const label = lead.hipagesActions.waitlistLabel ?? btn.label;
                            return (
                              <button
                                type="button"
                                disabled={btn.disabled}
                                onClick={() => handleHipagesAction(lead, "waitlist", lead.hipagesActions!.waitlist!)}
                                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"}`}
                                title={btn.title}
                                aria-label={label}
                              >
                                {shouldShowActionSpinner(lead.id, "waitlist", btn.label) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : isSuccess ? (
                                  <Check className="h-4 w-4" aria-hidden />
                                ) : null}
                                {label}
                              </button>
                            );
                          })()}
                        </>
                      )}
                  <button
                    type="button"
                    aria-label="View lead details"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete lead"
                    disabled={deletingId === lead.id}
                    onClick={() => handleDelete(lead.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    {deletingId === lead.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-neutral-100">
              <thead className="bg-neutral-50/80">
                <tr>
                  {/* Select-all checkbox */}
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Suburb / Postcode
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    <button
                      type="button"
                      onClick={handleSortCost}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
                    >
                      Cost
                      {sortBy === "cost" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <span className="inline-flex gap-0.5 text-neutral-400">
                          <ChevronUp className="h-3 w-3" aria-hidden />
                          <ChevronDown className="h-3 w-3 -ml-1.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    <button
                      type="button"
                      onClick={handleSortPosted}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
                    >
                      Posted
                      {sortBy === "posted" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <span className="inline-flex gap-0.5 text-neutral-400">
                          <ChevronUp className="h-3 w-3" aria-hidden />
                          <ChevronDown className="h-3 w-3 -ml-1.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Score
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-left">
                    Reasons
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {sorted.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`text-sm transition-colors ${checkedIds.has(lead.id) ? "bg-neutral-50" : ""}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select lead`}
                        checked={checkedIds.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                        className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-neutral-900"
                      />
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-neutral-600">
                      {lead.title?.trim() ? (
                        <p className="mb-1 line-clamp-2 text-xs font-medium text-neutral-800" title={lead.title}>
                          {lead.title}
                        </p>
                      ) : null}
                      {lead.customerName || lead.email || lead.phone ? (
                        <div className="flex flex-col gap-0.5">
                          {lead.customerName && (
                            <span className="truncate font-medium text-neutral-900">{lead.customerName}</span>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="truncate text-xs text-accent hover:underline" title={lead.email}>
                              {lead.email}
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="truncate text-xs text-neutral-600 hover:underline" title={lead.phone}>
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      ) : lead.sourceName?.toLowerCase().includes("hipages") && lead.sourceId && !lead.externalUrl ? (
                        <button
                          type="button"
                          disabled={!!fetchCustomerLeadId}
                          onClick={async () => {
                            setFetchCustomerLeadId(lead.id);
                            try {
                              await handleFetchCustomer(lead.id, lead.sourceId);
                            } finally {
                              setFetchCustomerLeadId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                        >
                          {fetchCustomerLeadId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Fetch
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {lead.sourceName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {suburbPostcode(lead)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-neutral-900"
                      title={
                        (lead.leadCost || lead.leadCostCredits != null)
                          ? undefined
                          : lead.sourceName?.toLowerCase().includes("hipages")
                            ? lead.platformAccepted
                              ? "Cost not found. Use Fetch on the customer cell to refresh from the Hipages job page."
                              : "Cost not found. Use Fetch on the customer cell to refresh from the job page."
                            : undefined
                      }
                    >
                      {formatLeadCost(lead) !== "—" ? formatLeadCost(lead) : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                      {formatReceivedDate(lead)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                      {lead.score}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-neutral-600">
                      {formatReasons(lead.reasons)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="ml-auto flex flex-col items-end gap-1">
                        {hipagesActionError[lead.id] && (
                          <span className="text-xs text-red-600" title={hipagesActionError[lead.id]}>
                            {hipagesActionError[lead.id].length > 30 ? `${hipagesActionError[lead.id].slice(0, 30)}…` : hipagesActionError[lead.id]}
                          </span>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {lead.sourceName?.toLowerCase().includes("hipages") &&
                            canQueueActionsForLead(lead.sourceId) &&
                            (lead.hipagesActions?.accept || lead.hipagesActions?.decline || lead.hipagesActions?.waitlist) && (
                            <>
                              {/* When accept label is "Join Waitlist", treat as waitlist: orange styling and send action "waitlist" so worker runs popup + Share my details. */}
                              {lead.hipagesActions.accept && (() => {
                                const isJoinWaitlist = /join\s*waitlist/i.test(lead.hipagesActions.acceptLabel ?? "");
                                const action: "accept" | "waitlist" = isJoinWaitlist ? "waitlist" : "accept";
                                const btn = getQueueActionButton(lead.id, action, isActionPendingUi(lead.id, action));
                                const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, action)?.status === "success";
                                const label = lead.hipagesActions.acceptLabel ?? btn.label;
                                const actionPath = lead.hipagesActions!.accept!;
                                const isOrange = isJoinWaitlist;
                                return (
                                  <button
                                    type="button"
                                    disabled={btn.disabled}
                                    onClick={() => handleHipagesAction(lead, action, actionPath)}
                                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? (isOrange ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100") : isOrange ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
                                    aria-label={label}
                                    title={btn.title}
                                  >
                                    {shouldShowActionSpinner(lead.id, action, btn.label) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : isSuccess ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                                    {label}
                                  </button>
                                );
                              })()}
                              {lead.hipagesActions.decline && (() => {
                                const btn = getQueueActionButton(lead.id, "decline", isActionPendingUi(lead.id, "decline"));
                                const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, "decline")?.status === "success";
                                const label = lead.hipagesActions.declineLabel ?? btn.label;
                                return (
                                  <button
                                    type="button"
                                    disabled={btn.disabled}
                                    onClick={() => handleHipagesAction(lead, "decline", lead.hipagesActions!.decline!)}
                                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100" : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"}`}
                                    aria-label={label}
                                    title={btn.title}
                                  >
                                    {shouldShowActionSpinner(lead.id, "decline", btn.label) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : isSuccess ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                                    {label}
                                  </button>
                                );
                              })()}
                              {lead.hipagesActions.waitlist && (() => {
                                const btn = getQueueActionButton(lead.id, "waitlist", isActionPendingUi(lead.id, "waitlist"));
                                const isSuccess = getActionStatus(actionStatusByLeadAndAction, lead.id, "waitlist")?.status === "success";
                                const label = lead.hipagesActions.waitlistLabel ?? btn.label;
                                return (
                                  <button
                                    type="button"
                                    disabled={btn.disabled}
                                    onClick={() => handleHipagesAction(lead, "waitlist", lead.hipagesActions!.waitlist!)}
                                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50 ${btn.label.startsWith("Failed") ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100" : "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"}`}
                                    aria-label={label}
                                    title={btn.title}
                                  >
                                    {shouldShowActionSpinner(lead.id, "waitlist", btn.label) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : isSuccess ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                                    {label}
                                  </button>
                                );
                              })()}
                            </>
                          )}
                        <button
                          type="button"
                          aria-label="View lead details"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete lead"
                          disabled={deletingId === lead.id}
                          onClick={() => handleDelete(lead.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          {deletingId === lead.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActivityLeadModal
        lead={selectedLead}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
