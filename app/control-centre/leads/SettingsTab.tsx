"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/leads/settings";
import { clearActivity } from "@/lib/leads/activity";
import type { LeadSettings } from "@/lib/leads/types";

// ─── Reusable primitives ──────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-5 border-b border-neutral-100 pb-4">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-neutral-500">{description}</p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
        checked ? "border-accent bg-accent" : "border-neutral-300 bg-neutral-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function NumberInput({
  id,
  value,
  onChange,
  min,
  suffix,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        value={value}
        min={min ?? 0}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-24 rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
      />
      {suffix && (
        <span className="text-xs text-neutral-500">{suffix}</span>
      )}
    </div>
  );
}

function SelectInput({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type WorkerHealth = "Healthy" | "Offline" | "Error";

const WORKER_STATUS_STYLES: Record<WorkerHealth, string> = {
  Healthy: "bg-emerald-50 text-emerald-800",
  Offline: "bg-neutral-100 text-neutral-600",
  Error: "bg-red-50 text-red-800",
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────

export function SettingsTab() {
  const [form, setForm] = useState<LeadSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const workerStatus: WorkerHealth = "Healthy";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setForm(data ?? DEFAULT_SETTINGS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof LeadSettings>(key: K, value: LeadSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveSettings(form);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Permanently delete all activity logs? This cannot be undone.")) return;
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      alert("Not signed in.");
      return;
    }
    await clearActivity(token);
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400";

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading settings...</span>
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
          onClick={load}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const { automationEnabled, defaultMode, scanInterval, maxAcceptsPerDay, maxAcceptsPerHour,
    maxScansPerHour, cooldownMinutes, stopOnError, minScore, rejectScore, requireKeywordMatch,
    ignoreDuplicates, notifyAccepted, notifyFailedScans, notifyErrors, notifyEmail } = form;

  return (
    <div className="space-y-6">
      {/* ── Section 1: Automation Settings ── */}
      <SectionCard
        title="Automation Settings"
        description="Control how the lead automation engine operates across all sources."
      >
        <SettingRow
          label="Master Automation"
          description="Enable or disable all automation globally. Disabling this stops all scheduled scans."
        >
          <Toggle
            id="automation-master"
            checked={automationEnabled}
            onChange={(v) => set("automationEnabled", v)}
          />
        </SettingRow>
        <SettingRow
          label="Default Mode"
          description="Mode applied to new sources unless overridden individually."
        >
          <SelectInput
            id="default-mode"
            value={defaultMode}
            onChange={(v) => set("defaultMode", v as LeadSettings["defaultMode"])}
            options={[
              { value: "manual", label: "Manual" },
              { value: "dry-run", label: "Dry Run" },
              { value: "live", label: "Live" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Default Scan Interval"
          description="How often sources are scanned by default (in minutes)."
        >
          <NumberInput
            id="scan-interval"
            value={scanInterval}
            onChange={(v) => set("scanInterval", v)}
            min={1}
            suffix="min"
          />
        </SettingRow>
      </SectionCard>

      {/* ── Section 2: Safety Limits ── */}
      <SectionCard
        title="Safety Limits"
        description="Hard limits to prevent excessive lead acceptance or resource usage."
      >
        <SettingRow
          label="Max Accepts per Day"
          description="Maximum number of leads that can be accepted in a 24-hour period."
        >
          <NumberInput
            id="max-accepts-day"
            value={maxAcceptsPerDay}
            onChange={(v) => set("maxAcceptsPerDay", v)}
            min={0}
            suffix="leads"
          />
        </SettingRow>
        <SettingRow
          label="Max Accepts per Hour"
          description="Maximum accepts allowed within any rolling 60-minute window."
        >
          <NumberInput
            id="max-accepts-hour"
            value={maxAcceptsPerHour}
            onChange={(v) => set("maxAcceptsPerHour", v)}
            min={0}
            suffix="leads"
          />
        </SettingRow>
        <SettingRow
          label="Max Scans per Hour"
          description="Maximum number of source scans per hour across all sources."
        >
          <NumberInput
            id="max-scans-hour"
            value={maxScansPerHour}
            onChange={(v) => set("maxScansPerHour", v)}
            min={0}
            suffix="scans"
          />
        </SettingRow>
        <SettingRow
          label="Cooldown Between Accepts"
          description="Minimum time to wait between consecutive lead acceptances."
        >
          <NumberInput
            id="cooldown"
            value={cooldownMinutes}
            onChange={(v) => set("cooldownMinutes", v)}
            min={0}
            suffix="min"
          />
        </SettingRow>
        <SettingRow
          label="Stop Automation on Error"
          description="Automatically pause all sources if a critical error is detected."
        >
          <Toggle
            id="stop-on-error"
            checked={stopOnError}
            onChange={(v) => set("stopOnError", v)}
          />
        </SettingRow>
      </SectionCard>

      {/* ── Section 3: Lead Filtering Defaults ── */}
      <SectionCard
        title="Lead Filtering Defaults"
        description="Default thresholds applied when a source has no rule set assigned."
      >
        <SettingRow
          label="Default Minimum Score"
          description="Leads scoring below this value will be sent to review."
        >
          <NumberInput
            id="min-score"
            value={minScore}
            onChange={(v) => set("minScore", v)}
            min={0}
            suffix="pts"
          />
        </SettingRow>
        <SettingRow
          label="Default Reject Score"
          description="Leads scoring below this value will be automatically rejected."
        >
          <NumberInput
            id="reject-score"
            value={rejectScore}
            onChange={(v) => set("rejectScore", v)}
            min={0}
            suffix="pts"
          />
        </SettingRow>
        <SettingRow
          label="Require Keyword Match"
          description="Leads without at least one required keyword will be rejected regardless of score."
        >
          <Toggle
            id="require-keyword"
            checked={requireKeywordMatch}
            onChange={(v) => set("requireKeywordMatch", v)}
          />
        </SettingRow>
        <SettingRow
          label="Ignore Duplicate Leads"
          description="Automatically skip leads that have already been scanned in the past 24 hours."
        >
          <Toggle
            id="ignore-duplicates"
            checked={ignoreDuplicates}
            onChange={(v) => set("ignoreDuplicates", v)}
          />
        </SettingRow>
      </SectionCard>

      {/* ── Section 4: Notifications ── */}
      <SectionCard
        title="Notifications"
        description="Configure when and where system alerts are sent."
      >
        <SettingRow
          label="Notify on Accepted Leads"
          description="Send an alert when a lead is accepted by the system."
        >
          <Toggle
            id="notify-accepted"
            checked={notifyAccepted}
            onChange={(v) => set("notifyAccepted", v)}
          />
        </SettingRow>
        <SettingRow
          label="Notify on Failed Scans"
          description="Send an alert when a source scan fails or times out."
        >
          <Toggle
            id="notify-failed"
            checked={notifyFailedScans}
            onChange={(v) => set("notifyFailedScans", v)}
          />
        </SettingRow>
        <SettingRow
          label="Notify on Errors"
          description="Send an alert for any critical system or automation errors."
        >
          <Toggle
            id="notify-errors"
            checked={notifyErrors}
            onChange={(v) => set("notifyErrors", v)}
          />
        </SettingRow>
        <SettingRow
          label="Notification Email"
          description="Email address where all system alerts are sent."
        >
          <input
            id="notify-email"
            type="email"
            value={notifyEmail}
            onChange={(e) => set("notifyEmail", e.target.value)}
            className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder="you@example.com"
          />
        </SettingRow>
      </SectionCard>

      {/* ── Section 5: Worker Status ── */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 border-b border-neutral-100 pb-4">
          <h3 className="text-sm font-semibold text-neutral-900">Worker Status</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Read-only view of the background automation worker.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Status</p>
            <div className="mt-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${WORKER_STATUS_STYLES[workerStatus]}`}
              >
                {workerStatus}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Last Run</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">2 min ago</p>
            <p className="mt-0.5 text-xs text-neutral-400">9:14 AM today</p>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Last Success</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">2 min ago</p>
            <p className="mt-0.5 text-xs text-neutral-400">hipages scan</p>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Last Error</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">3 hr ago</p>
            <p className="mt-0.5 text-xs text-neutral-400">Oneflare timeout</p>
          </div>
        </div>
      </div>

      {/* ── Save button ── */}
      <div className="flex items-center justify-end gap-2">
        {saveSuccess && (
          <span className="text-sm text-emerald-600 font-medium">Settings saved.</span>
        )}
        <button
          type="button"
          onClick={() => setForm(DEFAULT_SETTINGS)}
          disabled={saving}
          className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Reset to Defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Settings
        </button>
      </div>

      {/* ── Section 6: Danger Zone ── */}
      <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
        <div className="mb-5 border-b border-red-100 pb-4">
          <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
          <p className="mt-1 text-xs text-red-500">
            These actions are irreversible or have immediate operational impact. Use with caution.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800">Pause All Sources</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Immediately pause scanning across all active sources.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 min-h-[40px] rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Pause All
            </button>
          </div>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800">Reset Counters</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Reset today&apos;s acceptance and scan counters to zero.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 min-h-[40px] rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Reset Counters
            </button>
          </div>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800">Clear Activity Logs</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Permanently delete all activity log entries. Cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearLogs}
              className="shrink-0 min-h-[40px] rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Clear Logs
            </button>
          </div>
          <div className="flex items-start justify-between gap-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800">Emergency Stop</p>
              <p className="mt-0.5 text-xs text-red-600">
                Immediately halt all automation, stop all scans, and disable the worker. Requires manual restart to resume.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 min-h-[40px] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Emergency Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
