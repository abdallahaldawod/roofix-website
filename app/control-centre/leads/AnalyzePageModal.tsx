"use client";

import { useState } from "react";
import { X, Loader2, AlertCircle, Save } from "lucide-react";
import type { SourceExtractionConfig } from "@/lib/leads/types";

export type AnalyzePageDiagnostics = {
  pageTitle: string;
  pageUrl: string;
  candidateContainerCount: number;
  chosenLeadCardSelector: string;
  chosenLeadCardCount: number;
  warnings: string[];
  previewLeadCount?: number;
};

export type AnalyzePageModalData = {
  sourceId: string;
  sourceName: string;
  diagnostics: AnalyzePageDiagnostics;
  suggestedConfig: SourceExtractionConfig;
  previewLeads: Array<{
    externalId?: string;
    title: string;
    description: string;
    suburb: string;
    postcode?: string;
  }>;
};

type AnalyzePageModalProps = {
  data: AnalyzePageModalData | null;
  onClose: () => void;
  onSave: (sourceId: string, extractionConfig: SourceExtractionConfig) => Promise<void>;
};

function truncate(s: string, max: number): string {
  if (!s) return "—";
  return s.length <= max ? s : s.slice(0, max - 3) + "…";
}

export function AnalyzePageModal({
  data,
  onClose,
  onSave,
}: AnalyzePageModalProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!data) return null;

  const { sourceId, sourceName, diagnostics, suggestedConfig, previewLeads } = data;

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(sourceId, suggestedConfig);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const configEntries = [
    { label: "Lead card", value: suggestedConfig.leadCardSelector },
    { label: "Title", value: suggestedConfig.titleSelector },
    { label: "Description", value: suggestedConfig.descriptionSelector },
    { label: "Suburb", value: suggestedConfig.suburbSelector },
    { label: "Postcode", value: suggestedConfig.postcodeSelector },
    { label: "External ID", value: suggestedConfig.externalIdSelector || suggestedConfig.externalIdAttribute || "—" },
    { label: "Detail link", value: suggestedConfig.detailLinkSelector },
    { label: "Posted at", value: suggestedConfig.postedAtSelector },
  ].filter((e) => e.value);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="analyze-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-6">
          <h2 id="analyze-modal-title" className="text-lg font-semibold text-neutral-900">
            Analyze Page — {sourceName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {/* Diagnostics */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Diagnostics
            </h3>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
              <dl className="space-y-1.5 text-sm">
                <div>
                  <dt className="text-neutral-500">Page title</dt>
                  <dd className="font-medium text-neutral-900 truncate" title={diagnostics.pageTitle}>
                    {diagnostics.pageTitle || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Page URL</dt>
                  <dd className="break-all font-mono text-xs text-neutral-700" title={diagnostics.pageUrl}>
                    {truncate(diagnostics.pageUrl, 70)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Candidate containers found</dt>
                  <dd className="tabular-nums font-medium text-neutral-900">
                    {diagnostics.candidateContainerCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Chosen lead card selector</dt>
                  <dd className="font-mono text-xs text-neutral-900 break-all">
                    {diagnostics.chosenLeadCardSelector || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Lead cards on page</dt>
                  <dd className="tabular-nums font-medium text-neutral-900">
                    {diagnostics.chosenLeadCardCount}
                  </dd>
                </div>
                {diagnostics.previewLeadCount != null && (
                  <div>
                    <dt className="text-neutral-500">Preview leads extracted</dt>
                    <dd className="tabular-nums font-medium text-neutral-900">
                      {diagnostics.previewLeadCount}
                    </dd>
                  </div>
                )}
                {diagnostics.warnings.length > 0 && (
                  <div>
                    <dt className="text-neutral-500 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Warnings
                    </dt>
                    <dd className="mt-1 text-xs text-amber-800">
                      <ul className="list-disc pl-4 space-y-0.5">
                        {diagnostics.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Suggested config */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Suggested extraction config
            </h3>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
              <dl className="space-y-2 text-sm">
                {configEntries.map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="font-mono text-xs text-neutral-900 break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* Preview leads */}
          {previewLeads.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Preview leads ({previewLeads.length})
              </h3>
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/80">
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">ID</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">Title</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">Suburb</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">Postcode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLeads.map((lead, i) => (
                      <tr key={i} className="border-b border-neutral-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-neutral-700">
                          {truncate(lead.externalId ?? "—", 12)}
                        </td>
                        <td className="px-3 py-2 font-medium text-neutral-900 max-w-[140px]">
                          {truncate(lead.title, 30)}
                        </td>
                        <td className="px-3 py-2 text-neutral-700 max-w-[180px]">
                          {truncate(lead.description, 40)}
                        </td>
                        <td className="px-3 py-2 text-neutral-700">{lead.suburb || "—"}</td>
                        <td className="px-3 py-2 text-neutral-700">{lead.postcode ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {saveError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {saveError}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 bg-neutral-50/50 px-4 py-4 sm:px-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !suggestedConfig.leadCardSelector}
            onClick={handleSave}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save extraction config
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
