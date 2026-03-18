"use client";

import { Loader2 } from "lucide-react";

type Mode = "Dry Run" | "Live";

type LeadManagementHeaderProps = {
  onAddSource: () => void;
  onRunTest: () => void;
  automationOn: boolean;
  onAutomationChange: (on: boolean) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  runningTest?: boolean;
};

export function LeadManagementHeader({
  onAddSource,
  onRunTest,
  automationOn,
  onAutomationChange,
  mode,
  onModeChange,
  runningTest = false,
}: LeadManagementHeaderProps) {
  return (
    <header className="border-b border-neutral-200 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Lead Management
          </h1>
          <p className="mt-2 text-neutral-600 sm:text-base">
            Manage and automate your roofing leads across all sources
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onAddSource}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
          >
            Add Source
          </button>
          <button
            type="button"
            onClick={onRunTest}
            disabled={runningTest}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {runningTest && <Loader2 className="h-4 w-4 animate-spin" />}
            {runningTest ? "Running..." : "Run Test"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">Automation</span>
            <button
              type="button"
              role="switch"
              aria-checked={automationOn}
              onClick={() => onAutomationChange(!automationOn)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
                automationOn ? "border-accent bg-accent" : "border-neutral-300 bg-neutral-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  automationOn ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-neutral-600">{automationOn ? "ON" : "OFF"}</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="lead-mode" className="text-sm font-medium text-neutral-700">
              Mode
            </label>
            <select
              id="lead-mode"
              value={mode}
              onChange={(e) => onModeChange(e.target.value as Mode)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              <option value="Dry Run">Dry Run</option>
              <option value="Live">Live</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
