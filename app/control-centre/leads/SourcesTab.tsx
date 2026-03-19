"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, AlertCircle, Link2 } from "lucide-react";
import { StatCard } from "./StatCard";
import { SourcesTable } from "./SourcesTable";
import { SourceDetailsDrawer } from "./SourceDetailsDrawer";
import { EmptyState } from "./EmptyState";
import { AddSourceModal } from "./AddSourceModal";
import { AnalyzePageModal, type AnalyzePageModalData } from "./AnalyzePageModal";
import {
  getSources,
  createSource,
  updateSource,
  deleteSource,
  pauseSource,
  activateSource,
} from "@/lib/leads/sources";
import { deleteSourceAndCredentials } from "./actions";
import { getRuleSets } from "@/lib/leads/rule-sets";
import type { LeadSource, LeadSourceCreate, LeadRuleSet, ScanRun, SourceExtractionConfig } from "@/lib/leads/types";
import { getFirebaseAuth } from "@/lib/firebase/client";

type SourcesTabProps = {
  onRunSourceTest: (source: LeadSource) => void;
  /** When provided, the header "Add Source" button can open this modal */
  addModalOpen?: boolean;
  onAddModalClose?: () => void;
  onAddModalOpen?: () => void;
  /** Base path for links (e.g. /control-centre) */
  basePath?: string;
};

export function SourcesTab({
  onRunSourceTest,
  addModalOpen: controlledAddModalOpen,
  onAddModalClose,
  onAddModalOpen,
  basePath = "",
}: SourcesTabProps) {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [ruleSets, setRuleSets] = useState<LeadRuleSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [internalAddModalOpen, setInternalAddModalOpen] = useState(false);
  const [detailsSource, setDetailsSource] = useState<LeadSource | null>(null);
  const addModalOpen =
    controlledAddModalOpen !== undefined ? controlledAddModalOpen : internalAddModalOpen;
  const closeAddModal =
    onAddModalClose != null
      ? () => {
          onAddModalClose();
          setEditingSource(null);
        }
      : () => {
          setInternalAddModalOpen(false);
          setEditingSource(null);
        };

  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [analyzeResultModal, setAnalyzeResultModal] = useState<AnalyzePageModalData | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const wasConnectingOrScanningRef = useRef(false);

  // Sync details drawer source after connect finishes
  useEffect(() => {
    if (connectingSourceId) {
      wasConnectingOrScanningRef.current = true;
    } else if (wasConnectingOrScanningRef.current && detailsSource) {
      wasConnectingOrScanningRef.current = false;
      const next = sources.find((s) => s.id === detailsSource.id);
      if (next) setDetailsSource(next);
    }
  }, [connectingSourceId, detailsSource, sources]);

  const load = useCallback(async (silent = false): Promise<LeadSource[]> => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [srcs, rss] = await Promise.all([getSources(), getRuleSets()]);
      setSources(srcs);
      setRuleSets(rss);
      return srcs;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sources.");
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(data: LeadSourceCreate): Promise<string> {
    if (editingSource) {
      await updateSource(editingSource.id, data);
      await load();
      return editingSource.id;
    }
    const id = await createSource(data);
    await load();
    return id;
  }

  async function handleToggleStatus(id: string) {
    const source = sources.find((s) => s.id === id);
    if (source?.status === "Active") {
      await pauseSource(id);
    } else {
      await activateSource(id);
    }
    await load();
  }

  async function handleDelete(id: string) {
    const source = sources.find((s) => s.id === id);
    if (source?.isSystem) return;
    const result = await deleteSourceAndCredentials(id);
    if (result.ok) {
      await load();
      return;
    }
    await deleteSource(id);
    await load();
  }

  function handleEdit(id: string) {
    const src = sources.find((s) => s.id === id) ?? null;
    setEditingSource(src);
    if (onAddModalOpen) onAddModalOpen();
    else setInternalAddModalOpen(true);
  }

  function handleRunTest(id: string) {
    const src = sources.find((s) => s.id === id);
    if (src) onRunSourceTest(src);
  }

  async function handleConnect(id: string) {
    setConnectError(null);
    setConnectingSourceId(id);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setConnectError("Please log in again.");
        setConnectingSourceId(null);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/control-centre/leads/connect-source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnectError(data?.error ?? "Connection failed");
        return;
      }
      await load(true);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnectingSourceId(null);
    }
  }

  async function fetchScanRuns(sourceId: string): Promise<ScanRun[]> {
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) return [];
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/control-centre/leads/scan-runs?sourceId=${encodeURIComponent(sourceId)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { runs?: ScanRun[] };
      return data.runs ?? [];
    } catch {
      return [];
    }
  }

  async function handleAnalyzePage(sourceId: string) {
    setAnalyzeError(null);
    setAnalyzingSourceId(sourceId);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setAnalyzeError("Please log in again.");
        setAnalyzingSourceId(null);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/control-centre/leads/analyze-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnalyzeError(data?.error ?? "Analysis failed");
        return;
      }
      const source = sources.find((s) => s.id === sourceId);
      setAnalyzeResultModal({
        sourceId,
        sourceName: source?.name ?? "Source",
        diagnostics: data.diagnostics,
        suggestedConfig: data.suggestedConfig,
        previewLeads: data.previewLeads ?? [],
      });
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzingSourceId(null);
    }
  }

  async function handleSaveExtractionConfig(
    sourceId: string,
    extractionConfig: SourceExtractionConfig
  ): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please log in again.");
    const token = await user.getIdToken();
    const res = await fetch("/api/control-centre/leads/save-extraction-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sourceId, extractionConfig }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to save");
    const updated = await load(true);
    if (detailsSource?.id === sourceId) {
      setDetailsSource(updated.find((s) => s.id === sourceId) ?? null);
    }
  }

  // Computed stats
  const activeSources = sources.filter((s) => s.status === "Active").length;
  const scannedToday = sources.reduce((acc, s) => acc + s.scannedToday, 0);
  const matchedToday = sources.reduce((acc, s) => acc + s.matchedToday, 0);
  const errorSources = sources.filter((s) => s.status === "Error").length;
  const needsReconnectCount = sources.filter(
    (s) =>
      !s.isSystem &&
      (s.authStatus === "needs_reconnect" || s.lastScanStatus === "needs_reconnect")
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-20 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">Loading sources...</span>
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
          onClick={() => load()}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Active Sources" value={activeSources} />
        <StatCard title="Leads Scanned Today" value={scannedToday} />
        <StatCard title="Leads Matched" value={matchedToday} />
        <StatCard title="Total Sources" value={sources.length} />
        <StatCard
          title="System Status"
          value={errorSources > 0 ? "Error" : "Healthy"}
          status={errorSources > 0 ? "Error" : "Healthy"}
        />
      </div>

      {/* Table or empty state */}
      {sources.length === 0 ? (
        <EmptyState
          onAddSource={() => (onAddModalOpen ? onAddModalOpen() : setInternalAddModalOpen(true))}
        />
      ) : (
        <>
          {connectError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {connectError}
              <button
                type="button"
                onClick={() => setConnectError(null)}
                className="ml-2 font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {analyzeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {analyzeError}
              <button
                type="button"
                onClick={() => setAnalyzeError(null)}
                className="ml-2 font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {needsReconnectCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-medium">
                {needsReconnectCount} source{needsReconnectCount !== 1 ? "s" : ""} need
                reconnection.
              </span>{" "}
              Session expired or connection lost. Click{" "}
              <span className="inline-flex items-center gap-1 font-medium">
                <Link2 className="h-3.5 w-3.5" />
                Reconnect
              </span>{" "}
              for each source in the table, or open source details for more info.
            </div>
          )}
          <SourcesTable
            sources={sources}
            scannerStatus={
              sources.some(
                (s) =>
                  !s.isSystem &&
                  (s.storageStatePath?.trim() ?? "") !== "" &&
                  (s.leadsUrl?.trim() ?? "") !== "" &&
                  s.status === "Active"
              )
                ? "Running"
                : "Paused"
            }
            onEdit={handleEdit}
            onPause={handleToggleStatus}
            onRunTest={handleRunTest}
            onDelete={handleDelete}
            onConnect={handleConnect}
            onViewDetails={(id) =>
              setDetailsSource(sources.find((s) => s.id === id) ?? null)
            }
            connectingSourceId={connectingSourceId}
          />
        </>
      )}

      {/* Source details drawer */}
      {detailsSource && (
        <SourceDetailsDrawer
          source={detailsSource}
          onClose={() => setDetailsSource(null)}
          onEdit={(id) => {
            handleEdit(id);
            setDetailsSource(null);
          }}
          onPause={async (id) => {
            await handleToggleStatus(id);
            const updated = await load(true);
            setDetailsSource(updated.find((s) => s.id === id) ?? null);
          }}
          onConnect={handleConnect}
          onAnalyzePage={handleAnalyzePage}
          onDelete={handleDelete}
          onFetchScanRuns={fetchScanRuns}
          connectingSourceId={connectingSourceId}
          analyzingSourceId={analyzingSourceId}
          basePath={basePath}
        />
      )}

      {/* Add / Edit modal */}
      <AddSourceModal
        open={addModalOpen}
        onClose={closeAddModal}
        onSave={handleSave}
        ruleSets={ruleSets}
        editingSource={editingSource}
      />

      {/* Analyze Page result modal */}
      <AnalyzePageModal
        data={analyzeResultModal}
        onClose={() => setAnalyzeResultModal(null)}
        onSave={handleSaveExtractionConfig}
      />
    </div>
  );
}
