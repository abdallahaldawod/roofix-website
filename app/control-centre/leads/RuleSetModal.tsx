"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { LeadRuleSet, LeadRuleSetCreate, ScoringRule, ThresholdConfig } from "@/lib/leads/types";
import { KeywordChips } from "./KeywordChips";

type RuleSetModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: LeadRuleSetCreate) => Promise<void>;
  editingRuleSet?: LeadRuleSet | null;
};

const EMPTY_RULESET: LeadRuleSetCreate = {
  name: "",
  description: "",
  status: "Active",
  minScore: 20,
  requiredKeywords: [],
  excludedKeywords: [],
  scoringRules: [],
  locationFilters: [],
  thresholds: { accept: 30, review: 15, reject: 0 },
  safetyControls: { maxLeadsPerDay: 50, cooldownMinutes: 30 },
};

export function RuleSetModal({ open, onClose, onSave, editingRuleSet }: RuleSetModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [requiredKeywords, setRequiredKeywords] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdConfig>(EMPTY_RULESET.thresholds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingRuleSet) {
      setName(editingRuleSet.name);
      setDescription(editingRuleSet.description);
      setActive(editingRuleSet.status === "Active");
      setRequiredKeywords(editingRuleSet.requiredKeywords);
      setExcludedKeywords(editingRuleSet.excludedKeywords);
      setScoringRules(editingRuleSet.scoringRules.length ? editingRuleSet.scoringRules : [{ keyword: "", score: 10 }]);
      setThresholds(editingRuleSet.thresholds);
    } else {
      setName("");
      setDescription("");
      setActive(true);
      setRequiredKeywords([]);
      setExcludedKeywords([]);
      setScoringRules([{ keyword: "", score: 10 }]);
      setThresholds(EMPTY_RULESET.thresholds);
    }
  }, [editingRuleSet, open]);

  if (!open) return null;

  function addScoringRule() {
    setScoringRules([...scoringRules, { keyword: "", score: 10 }]);
  }

  function removeScoringRule(index: number) {
    setScoringRules(scoringRules.filter((_, i) => i !== index));
  }

  function updateScoringRule(index: number, field: "keyword" | "score", value: string | number) {
    setScoringRules(
      scoringRules.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  const validScoringRules = scoringRules.filter((r) => r.keyword.trim() !== "");

  async function handleSave() {
    const status = active ? ("Active" as const) : ("Inactive" as const);
    const base: LeadRuleSetCreate = editingRuleSet
      ? {
          name,
          description,
          status,
          minScore: editingRuleSet.minScore,
          requiredKeywords,
          excludedKeywords,
          scoringRules: validScoringRules,
          locationFilters: editingRuleSet.locationFilters,
          thresholds,
          safetyControls: editingRuleSet.safetyControls,
        }
      : {
          ...EMPTY_RULESET,
          name,
          description,
          status,
          requiredKeywords,
          excludedKeywords,
          scoringRules: validScoringRules,
          thresholds,
        };
    setSaving(true);
    try {
      await onSave(base);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          {editingRuleSet ? "Edit Rule Set" : "Create Rule Set"}
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="ruleset-name" className="block text-sm font-medium text-neutral-700">
              Name
            </label>
            <input
              id="ruleset-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="e.g. Roofing Metro"
            />
          </div>
          <div>
            <label htmlFor="ruleset-description" className="block text-sm font-medium text-neutral-700">
              Description
            </label>
            <textarea
              id="ruleset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="Describe what this rule set targets..."
            />
          </div>

          <KeywordChips
            label="Required keywords (lead must contain at least one)"
            chips={requiredKeywords}
            onChange={setRequiredKeywords}
            placeholder="e.g. roofing, guttering"
          />
          <KeywordChips
            label="Excluded keywords (reject if any match)"
            chips={excludedKeywords}
            onChange={setExcludedKeywords}
            placeholder="e.g. commercial, high-rise"
          />

          <div>
            <p className="mb-1.5 text-sm font-medium text-neutral-700">Scoring keywords (add points when matched)</p>
            <div className="space-y-2">
              {scoringRules.map((rule, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={rule.keyword}
                    onChange={(e) => updateScoringRule(i, "keyword", e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    placeholder="Keyword"
                  />
                  <input
                    type="number"
                    min={0}
                    value={rule.score}
                    onChange={(e) => updateScoringRule(i, "score", parseInt(e.target.value, 10) || 0)}
                    className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeScoringRule(i)}
                    aria-label="Remove row"
                    className="rounded-lg border border-neutral-300 p-2 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addScoringRule}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
              >
                <Plus className="h-4 w-4" /> Add keyword
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4">
            <p className="mb-1.5 text-sm font-medium text-neutral-700">Action when triggered</p>
            <p className="mb-3 text-xs text-neutral-500">
              After matching keywords, the lead is scored. Choose what to do for each score range:
            </p>
            <ul className="mb-4 space-y-2 text-xs text-neutral-600">
              <li className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">Accept</span>
                <span>Score ≥ threshold → accept lead (e.g. for follow-up)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Review</span>
                <span>Score ≥ threshold but below Accept → manual review</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">Reject</span>
                <span>Score below Review → reject lead</span>
              </li>
            </ul>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="threshold-accept" className="block text-xs font-medium text-neutral-600">Accept (score ≥)</label>
                <input
                  id="threshold-accept"
                  type="number"
                  min={0}
                  value={thresholds.accept}
                  onChange={(e) => setThresholds((t) => ({ ...t, accept: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div>
                <label htmlFor="threshold-review" className="block text-xs font-medium text-neutral-600">Review (score ≥)</label>
                <input
                  id="threshold-review"
                  type="number"
                  min={0}
                  value={thresholds.review}
                  onChange={(e) => setThresholds((t) => ({ ...t, review: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div>
                <label htmlFor="threshold-reject" className="block text-xs font-medium text-neutral-600">Reject (score &lt;)</label>
                <input
                  id="threshold-reject"
                  type="number"
                  min={0}
                  value={thresholds.reject}
                  onChange={(e) => setThresholds((t) => ({ ...t, reject: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
                active ? "border-accent bg-accent" : "border-neutral-300 bg-neutral-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  active ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm font-medium text-neutral-700">Active</span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Rule Set
          </button>
        </div>
      </div>
    </div>
  );
}
