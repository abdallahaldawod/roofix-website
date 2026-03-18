"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { RuleSetsTable } from "./RuleSetsTable";
import { RuleSetModal } from "./RuleSetModal";
import { RuleSetDetail } from "./RuleSetDetail";
import {
  getRuleSets,
  createRuleSet,
  updateRuleSet,
  deleteRuleSet,
} from "@/lib/leads/rule-sets";
import { getSources } from "@/lib/leads/sources";
import type { LeadRuleSet, LeadRuleSetCreate } from "@/lib/leads/types";

export function RuleSetsTab() {
  const [ruleSets, setRuleSets] = useState<LeadRuleSet[]>([]);
  const [sourcesUsingMap, setSourcesUsingMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<LeadRuleSet | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rss, sources] = await Promise.all([getRuleSets(), getSources()]);
      setRuleSets(rss);
      // Count how many sources reference each rule set
      const map: Record<string, number> = {};
      for (const src of sources) {
        if (src.ruleSetId) {
          map[src.ruleSetId] = (map[src.ruleSetId] ?? 0) + 1;
        }
      }
      setSourcesUsingMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rule sets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(data: LeadRuleSetCreate) {
    if (editingRuleSet) {
      await updateRuleSet(editingRuleSet.id, data);
    } else {
      await createRuleSet(data);
    }
    await load();
  }

  async function handleDetailSave(data: Partial<LeadRuleSetCreate>) {
    if (selectedId) {
      await updateRuleSet(selectedId, data);
      await load();
    }
  }

  async function handleDelete(id: string) {
    await deleteRuleSet(id);
    setSelectedId(null);
    await load();
  }

  const selectedRuleSet = selectedId ? (ruleSets.find((r) => r.id === selectedId) ?? null) : null;

  // Augment rule sets with sourcesUsing count for table display
  const ruleSetsWithCount = ruleSets.map((rs) => ({
    ...rs,
    sourcesUsing: sourcesUsingMap[rs.id] ?? 0,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading rule sets...</span>
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

  return (
    <>
      {selectedRuleSet ? (
        <RuleSetDetail
          ruleSet={{ ...selectedRuleSet, sourcesUsing: sourcesUsingMap[selectedRuleSet.id] ?? 0 }}
          onBack={() => setSelectedId(null)}
          onEdit={() => {
            setEditingRuleSet(selectedRuleSet);
            setModalOpen(true);
          }}
          onSave={handleDetailSave}
        />
      ) : (
        <RuleSetsTable
          ruleSets={ruleSetsWithCount}
          onSelect={setSelectedId}
          onEdit={(id) => {
            setEditingRuleSet(ruleSets.find((r) => r.id === id) ?? null);
            setModalOpen(true);
          }}
          onCreate={() => {
            setEditingRuleSet(null);
            setModalOpen(true);
          }}
          onDelete={handleDelete}
        />
      )}

      <RuleSetModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRuleSet(null);
        }}
        onSave={handleSave}
        editingRuleSet={editingRuleSet}
      />
    </>
  );
}
