"use client";

import { useState } from "react";
import { ChevronLeft, Loader2, Pencil, Plus, X } from "lucide-react";
import type { LeadRuleSet, LeadRuleSetCreate, LeadRuleSetStatus } from "@/lib/leads/types";
import { KeywordChips } from "./KeywordChips";

type RuleSet = LeadRuleSet & { sourcesUsing?: number };
type RuleSetStatus = LeadRuleSetStatus;

function RuleSetStatusBadge({ status }: { status: RuleSetStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "Active"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {status}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-neutral-700">{title}</h3>
      {children}
    </div>
  );
}

type PreviewDecision = "Accept" | "Review" | "Reject" | null;

function computePreview(
  text: string,
  ruleSet: RuleSet
): { matchedKeywords: string[]; score: number; decision: PreviewDecision } {
  const lower = text.toLowerCase();
  const allKeywords = [
    ...ruleSet.requiredKeywords,
    ...ruleSet.scoringRules.map((r) => r.keyword),
  ];
  const matchedKeywords = Array.from(
    new Set(allKeywords.filter((kw) => lower.includes(kw.toLowerCase())))
  );
  const score = ruleSet.scoringRules.reduce((acc, rule) => {
    return lower.includes(rule.keyword.toLowerCase()) ? acc + rule.score : acc;
  }, 0);
  let decision: PreviewDecision = null;
  if (score >= ruleSet.thresholds.accept) decision = "Accept";
  else if (score >= ruleSet.thresholds.review) decision = "Review";
  else decision = "Reject";
  return { matchedKeywords, score, decision };
}

const DECISION_STYLES: Record<NonNullable<PreviewDecision>, string> = {
  Accept: "bg-emerald-50 text-emerald-800",
  Review: "bg-amber-50 text-amber-800",
  Reject: "bg-red-50 text-red-800",
};

type RuleSetDetailProps = {
  ruleSet: RuleSet;
  onBack: () => void;
  onEdit: () => void;
  onSave: (data: Partial<LeadRuleSetCreate>) => Promise<void>;
};

export function RuleSetDetail({ ruleSet, onBack, onEdit, onSave }: RuleSetDetailProps) {
  const [requiredKeywords, setRequiredKeywords] = useState(ruleSet.requiredKeywords);
  const [excludedKeywords, setExcludedKeywords] = useState(ruleSet.excludedKeywords);
  const [scoringRules, setScoringRules] = useState(ruleSet.scoringRules);
  const [locationFilters, setLocationFilters] = useState(ruleSet.locationFilters);
  const [thresholds, setThresholds] = useState(ruleSet.thresholds);
  const [safetyControls, setSafetyControls] = useState(ruleSet.safetyControls);
  const [previewText, setPreviewText] = useState("");
  const [previewRan, setPreviewRan] = useState(false);
  const [saving, setSaving] = useState(false);

  const previewResult =
    previewRan && previewText.trim().length > 0
      ? computePreview(previewText, {
          ...ruleSet,
          requiredKeywords,
          excludedKeywords,
          scoringRules,
          thresholds,
        })
      : null;

  function addScoringRule() {
    setScoringRules([...scoringRules, { keyword: "", score: 10 }]);
  }

  function removeScoringRule(index: number) {
    setScoringRules(scoringRules.filter((_, i) => i !== index));
  }

  function updateScoringRule(
    index: number,
    field: "keyword" | "score",
    value: string | number
  ) {
    setScoringRules(
      scoringRules.map((rule, i) =>
        i === index ? { ...rule, [field]: value } : rule
      )
    );
  }

  return (
    <div className="space-y-6">
      {/* Back navigation + header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Rule Sets
        </button>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-neutral-900">{ruleSet.name}</h2>
            <RuleSetStatusBadge status={ruleSet.status} />
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-600">{ruleSet.description}</p>
      </div>

      {/* 1. Basic Info */}
      <SectionCard title="Basic Info">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Name</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">{ruleSet.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Status</p>
            <div className="mt-1">
              <RuleSetStatusBadge status={ruleSet.status} />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Min Score</p>
            <p className="mt-1 tabular-nums text-sm font-medium text-neutral-900">{ruleSet.minScore}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Sources Using</p>
            <p className="mt-1 tabular-nums text-sm font-medium text-neutral-900">{ruleSet.sourcesUsing}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Description</p>
            <p className="mt-1 text-sm text-neutral-700">{ruleSet.description}</p>
          </div>
        </div>
      </SectionCard>

      {/* 2. Required Keywords */}
      <SectionCard title="Required Keywords">
        <KeywordChips
          label="Keywords that must appear in a lead for it to be processed"
          chips={requiredKeywords}
          onChange={setRequiredKeywords}
          placeholder="e.g. roof, roofing"
        />
      </SectionCard>

      {/* 3. Excluded Keywords */}
      <SectionCard title="Excluded Keywords">
        <KeywordChips
          label="Keywords that automatically disqualify a lead"
          chips={excludedKeywords}
          onChange={setExcludedKeywords}
          placeholder="e.g. diy, advice only"
        />
      </SectionCard>

      {/* 4. Scoring Rules */}
      <SectionCard title="Scoring Rules">
        <p className="mb-3 text-xs text-neutral-500">
          Assign score points to keywords. Higher scores increase the chance of acceptance.
        </p>
        <div className="space-y-2">
          {scoringRules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={rule.keyword}
                onChange={(e) => updateScoringRule(i, "keyword", e.target.value)}
                placeholder="Keyword"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
              <input
                type="number"
                value={rule.score}
                onChange={(e) =>
                  updateScoringRule(i, "score", parseInt(e.target.value, 10) || 0)
                }
                className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="Score"
                min={0}
              />
              <span className="shrink-0 text-xs text-neutral-400">pts</span>
              <button
                type="button"
                aria-label="Remove rule"
                onClick={() => removeScoringRule(i)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addScoringRule}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900"
        >
          <Plus className="h-4 w-4" />
          Add rule
        </button>
      </SectionCard>

      {/* 5. Location Filters */}
      <SectionCard title="Location Filters">
        <KeywordChips
          label="Allowed suburbs or postcodes"
          chips={locationFilters}
          onChange={setLocationFilters}
          placeholder="e.g. Sydney, 2000"
        />
      </SectionCard>

      {/* 6. Decision Thresholds */}
      <SectionCard title="Decision Thresholds">
        <p className="mb-3 text-xs text-neutral-500">
          Set the minimum score for each decision outcome.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="threshold-accept"
              className="block text-sm font-medium text-neutral-700"
            >
              Accept (&ge;)
            </label>
            <input
              id="threshold-accept"
              type="number"
              value={thresholds.accept}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, accept: parseInt(e.target.value, 10) || 0 }))
              }
              min={0}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-400">Leads scoring this or above are accepted</p>
          </div>
          <div>
            <label
              htmlFor="threshold-review"
              className="block text-sm font-medium text-neutral-700"
            >
              Review (&ge;)
            </label>
            <input
              id="threshold-review"
              type="number"
              value={thresholds.review}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, review: parseInt(e.target.value, 10) || 0 }))
              }
              min={0}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-400">Leads scoring this or above go to review</p>
          </div>
          <div>
            <label
              htmlFor="threshold-reject"
              className="block text-sm font-medium text-neutral-700"
            >
              Reject (&lt;)
            </label>
            <input
              id="threshold-reject"
              type="number"
              value={thresholds.reject}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, reject: parseInt(e.target.value, 10) || 0 }))
              }
              min={0}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-400">Leads scoring below review are rejected</p>
          </div>
        </div>
      </SectionCard>

      {/* 7. Safety Controls */}
      <SectionCard title="Safety Controls">
        <p className="mb-3 text-xs text-neutral-500">
          Limits to prevent excessive lead processing.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="safety-max-leads"
              className="block text-sm font-medium text-neutral-700"
            >
              Max Leads per Day
            </label>
            <input
              id="safety-max-leads"
              type="number"
              value={safetyControls.maxLeadsPerDay}
              onChange={(e) =>
                setSafetyControls((s) => ({
                  ...s,
                  maxLeadsPerDay: parseInt(e.target.value, 10) || 0,
                }))
              }
              min={0}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>
          <div>
            <label
              htmlFor="safety-cooldown"
              className="block text-sm font-medium text-neutral-700"
            >
              Cooldown (minutes)
            </label>
            <input
              id="safety-cooldown"
              type="number"
              value={safetyControls.cooldownMinutes}
              onChange={(e) =>
                setSafetyControls((s) => ({
                  ...s,
                  cooldownMinutes: parseInt(e.target.value, 10) || 0,
                }))
              }
              min={0}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 tabular-nums text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>
        </div>
      </SectionCard>

      {/* Footer actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                requiredKeywords,
                excludedKeywords,
                scoringRules,
                locationFilters,
                thresholds,
                safetyControls,
              });
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>

      {/* Preview Lead */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-700">Preview Lead</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Paste a lead description to simulate scoring against this rule set.
        </p>
        <textarea
          value={previewText}
          onChange={(e) => {
            setPreviewText(e.target.value);
            setPreviewRan(false);
          }}
          rows={4}
          className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          placeholder="e.g. I need a full metal roof replacement for my house in Sydney CBD. Urgent — leaking badly."
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreviewRan(true)}
            disabled={previewText.trim().length === 0}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run Preview
          </button>
          {previewRan && previewText.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPreviewText("");
                setPreviewRan(false);
              }}
              className="text-sm text-neutral-500 hover:text-neutral-700"
            >
              Clear
            </button>
          )}
        </div>

        {previewResult && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Matched Keywords
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {previewResult.matchedKeywords.length > 0 ? (
                    previewResult.matchedKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800"
                      >
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-500">No keywords matched</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Score
                  </p>
                  <p className="mt-1 tabular-nums text-2xl font-bold text-neutral-900">
                    {previewResult.score}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Decision
                  </p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                        DECISION_STYLES[previewResult.decision!]
                      }`}
                    >
                      {previewResult.decision}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  <p>Accept &ge; {thresholds.accept}</p>
                  <p>Review &ge; {thresholds.review}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
