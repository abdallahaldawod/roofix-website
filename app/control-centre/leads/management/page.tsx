"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useState, useCallback } from "react";
import { LeadManagementHeader } from "../LeadManagementHeader";
import { LeadManagementTabs, type LeadTab } from "../LeadManagementTabs";
import { SourcesTab } from "../SourcesTab";
import { RuleSetsTab } from "../RuleSetsTab";
import { ActivityTab } from "../ActivityTab";
import { SettingsTab } from "../SettingsTab";
import { getSources } from "@/lib/leads/sources";
import { getRuleSets } from "@/lib/leads/rule-sets";
import { runMockTestScan } from "@/lib/leads/test-scan";
import type { LeadSource } from "@/lib/leads/types";
import { useControlCentreBase } from "../../use-base-path";

export default function LeadManagementPage() {
  const base = useControlCentreBase();
  const [activeTab, setActiveTab] = useState<LeadTab>("sources");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [automationOn, setAutomationOn] = useState(true);
  const [mode, setMode] = useState<"Dry Run" | "Live">("Live");
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [runningTest, setRunningTest] = useState(false);

  const handleRunTest = useCallback(async () => {
    if (runningTest) return;
    setRunningTest(true);
    try {
      const [sources, ruleSets] = await Promise.all([getSources(), getRuleSets()]);
      const activeSource = sources.find((s) => s.status === "Active") ?? sources[0];
      const activeRuleSet = ruleSets.find((rs) => rs.status === "Active") ?? ruleSets[0];
      if (!activeSource || !activeRuleSet) {
        alert(
          "No sources or rule sets found. Please add at least one source and one rule set before running a test scan."
        );
        return;
      }
      await runMockTestScan(activeSource, activeRuleSet);
      setActivityRefreshKey((k) => k + 1);
      setActiveTab("activity");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Test scan failed. Please try again.");
    } finally {
      setRunningTest(false);
    }
  }, [runningTest]);

  function handleRunSourceTest(source: LeadSource) {
    void (async () => {
      if (runningTest) return;
      setRunningTest(true);
      try {
        const ruleSets = await getRuleSets();
        const ruleSet =
          source.ruleSetId
            ? ruleSets.find((rs) => rs.id === source.ruleSetId)
            : ruleSets.find((rs) => rs.status === "Active") ?? ruleSets[0];
        if (!ruleSet) {
          alert("No rule set found for this source. Please assign a rule set first.");
          return;
        }
        await runMockTestScan(source, ruleSet);
        setActivityRefreshKey((k) => k + 1);
        setActiveTab("activity");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Test scan failed.");
      } finally {
        setRunningTest(false);
      }
    })();
  }

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <Link
          href={base + "/leads"}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Leads
        </Link>
      </div>
      <LeadManagementHeader
        onAddSource={() => {
          setActiveTab("sources");
          setAddModalOpen(true);
        }}
        onRunTest={handleRunTest}
        automationOn={automationOn}
        onAutomationChange={setAutomationOn}
        mode={mode}
        onModeChange={setMode}
        runningTest={runningTest}
      />
      <div className="mt-6">
        <LeadManagementTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "sources" && (
        <div className="mt-6">
          <SourcesTab
            onRunSourceTest={handleRunSourceTest}
            addModalOpen={addModalOpen}
            onAddModalClose={() => setAddModalOpen(false)}
            onAddModalOpen={() => setAddModalOpen(true)}
            basePath={base}
          />
        </div>
      )}

      {activeTab === "rule-sets" && (
        <div className="mt-6">
          <RuleSetsTab />
        </div>
      )}

      {activeTab === "activity" && (
        <div className="mt-6">
          <ActivityTab refreshKey={activityRefreshKey} />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="mt-6">
          <SettingsTab />
        </div>
      )}
    </div>
  );
}
