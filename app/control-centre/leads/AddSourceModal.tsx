"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { LeadSourceCreate, LeadRuleSet, LeadSource, SourceExtractionConfig } from "@/lib/leads/types";
import { ROOFIX_WEBSITE_PLATFORM } from "@/lib/leads/types";

type AddSourceModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: LeadSourceCreate) => Promise<string>;
  ruleSets?: LeadRuleSet[];
  editingSource?: LeadSource | null;
};

const EMPTY_EXTRACTION = {
  leadCardSelector: "",
  titleSelector: "",
  descriptionSelector: "",
  suburbSelector: "",
  postcodeSelector: "",
  externalIdSelector: "",
  externalIdAttribute: "",
  detailLinkSelector: "",
  postedAtSelector: "",
};

/** Minimal form state for external sources (Add + Edit external). */
type ExternalFormState = {
  name: string;
  loginUrl: string;
  leadsUrl: string;
  ruleSetId: string;
  ruleSetName: string;
  scanFrequency: number;
  active: boolean;
  extractionConfig: typeof EMPTY_EXTRACTION;
  extractionOpen: boolean;
  extractionDebug: boolean;
};

/** Minimal form state for system source edit (Rule Set, Scan Frequency, Active only). */
type SystemFormState = {
  ruleSetId: string;
  ruleSetName: string;
  scanFrequency: number;
  active: boolean;
};

const EMPTY_EXTERNAL: ExternalFormState = {
  name: "",
  loginUrl: "",
  leadsUrl: "",
  ruleSetId: "",
  ruleSetName: "",
  scanFrequency: 15,
  active: true,
  extractionConfig: { ...EMPTY_EXTRACTION },
  extractionOpen: false,
  extractionDebug: false,
};

function toSourceExtractionConfig(
  ec: ExternalFormState["extractionConfig"]
): SourceExtractionConfig | undefined {
  if (!ec.leadCardSelector.trim()) return undefined;
  const out: SourceExtractionConfig = { leadCardSelector: ec.leadCardSelector.trim() };
  if (ec.titleSelector.trim()) out.titleSelector = ec.titleSelector.trim();
  if (ec.descriptionSelector.trim()) out.descriptionSelector = ec.descriptionSelector.trim();
  if (ec.suburbSelector.trim()) out.suburbSelector = ec.suburbSelector.trim();
  if (ec.postcodeSelector.trim()) out.postcodeSelector = ec.postcodeSelector.trim();
  if (ec.externalIdSelector.trim()) out.externalIdSelector = ec.externalIdSelector.trim();
  if (ec.externalIdAttribute.trim()) out.externalIdAttribute = ec.externalIdAttribute.trim();
  if (ec.detailLinkSelector.trim()) out.detailLinkSelector = ec.detailLinkSelector.trim();
  if (ec.postedAtSelector.trim()) out.postedAtSelector = ec.postedAtSelector.trim();
  return out;
}

export function AddSourceModal({
  open,
  onClose,
  onSave,
  ruleSets = [],
  editingSource,
}: AddSourceModalProps) {
  const isSystemSource = editingSource?.isSystem === true;

  const [externalForm, setExternalForm] = useState<ExternalFormState>(EMPTY_EXTERNAL);
  const [systemForm, setSystemForm] = useState<SystemFormState>({
    ruleSetId: "",
    ruleSetName: "",
    scanFrequency: 15,
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (editingSource) {
      if (editingSource.isSystem === true) {
        setSystemForm({
          ruleSetId: editingSource.ruleSetId,
          ruleSetName: editingSource.ruleSetName ?? "",
          scanFrequency: editingSource.scanFrequency,
          active: editingSource.active,
        });
      } else {
        const ec = editingSource.extractionConfig;
        setExternalForm({
          name: editingSource.name,
          loginUrl: editingSource.loginUrl ?? "",
          leadsUrl: editingSource.leadsUrl ?? "",
          ruleSetId: editingSource.ruleSetId,
          ruleSetName: editingSource.ruleSetName ?? "",
          scanFrequency: editingSource.scanFrequency,
          active: editingSource.active,
          extractionConfig: {
            leadCardSelector: ec?.leadCardSelector ?? "",
            titleSelector: ec?.titleSelector ?? "",
            descriptionSelector: ec?.descriptionSelector ?? "",
            suburbSelector: ec?.suburbSelector ?? "",
            postcodeSelector: ec?.postcodeSelector ?? "",
            externalIdSelector: ec?.externalIdSelector ?? "",
            externalIdAttribute: ec?.externalIdAttribute ?? "",
            detailLinkSelector: ec?.detailLinkSelector ?? "",
            postedAtSelector: ec?.postedAtSelector ?? "",
          },
          extractionOpen: false,
          extractionDebug: editingSource.extractionDebug ?? false,
        });
      }
    } else {
      setExternalForm(EMPTY_EXTERNAL);
    }
    setCreateError(null);
  }, [editingSource, open]);

  if (!open) return null;

  function handleRuleSetChange(id: string) {
    const rs = ruleSets.find((r) => r.id === id);
    const name = rs?.name ?? "";
    if (isSystemSource) {
      setSystemForm((f) => ({ ...f, ruleSetId: id, ruleSetName: name }));
    } else {
      setExternalForm((f) => ({ ...f, ruleSetId: id, ruleSetName: name }));
    }
  }

  async function handleSave() {
    setCreateError(null);
    if (!editingSource) {
      if (externalForm.name.trim().toLowerCase() === "roofix website") {
        setCreateError("Roofix Website is a built-in system source and cannot be created manually.");
        return;
      }
    }
    setSaving(true);
    try {
      let payload: LeadSourceCreate;
      if (isSystemSource && editingSource) {
        payload = {
          name: editingSource.name,
          platform: editingSource.platform,
          type: editingSource.type,
          status: editingSource.status,
          mode: editingSource.mode,
          ruleSetId: systemForm.ruleSetId,
          ruleSetName: systemForm.ruleSetName,
          scanMethod: editingSource.scanMethod,
          scanFrequency: systemForm.scanFrequency,
          active: systemForm.active,
        };
      } else if (editingSource) {
        payload = {
          name: externalForm.name,
          ruleSetId: externalForm.ruleSetId,
          ruleSetName: externalForm.ruleSetName,
          scanFrequency: externalForm.scanFrequency,
          active: externalForm.active,
          loginUrl: externalForm.loginUrl || undefined,
          leadsUrl: externalForm.leadsUrl || undefined,
          extractionConfig: toSourceExtractionConfig(externalForm.extractionConfig),
          extractionDebug: externalForm.extractionDebug,
        };
      } else {
        payload = {
          name: externalForm.name.trim(),
          ruleSetId: externalForm.ruleSetId,
          ruleSetName: externalForm.ruleSetName,
          scanFrequency: externalForm.scanFrequency,
          active: externalForm.active,
          loginUrl: externalForm.loginUrl.trim() || undefined,
          leadsUrl: externalForm.leadsUrl.trim() || undefined,
          extractionConfig: toSourceExtractionConfig(externalForm.extractionConfig),
          extractionDebug: externalForm.extractionDebug,
        };
      }
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          {editingSource
            ? isSystemSource
              ? "Edit Source (System)"
              : "Edit Source"
            : "Add Source"}
        </h2>
        {!editingSource && (
          <p className="mt-2 text-sm text-neutral-500">
            Configure a new external source for read-only lead scanning.
          </p>
        )}
        {isSystemSource && editingSource && (
          <p className="mt-2 text-sm text-neutral-500">
            System sources cannot be renamed or connected. You can change the rule set and scan settings.
          </p>
        )}
        {createError && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {createError}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {/* Source Name: external only (or read-only for system) */}
          {(isSystemSource && editingSource) ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700">Source Name</label>
              <p className="mt-1 text-sm text-neutral-900">{editingSource.name}</p>
            </div>
          ) : (
            <div>
              <label htmlFor="source-name" className="block text-sm font-medium text-neutral-700">
                Source Name
              </label>
              <input
                id="source-name"
                type="text"
                value={externalForm.name}
                onChange={(e) => setExternalForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                placeholder="e.g. hipages Roofing"
              />
            </div>
          )}

          {/* Login URL & Leads URL: external only */}
          {!isSystemSource && (
            <>
              <div>
                <label htmlFor="login-url" className="block text-sm font-medium text-neutral-700">
                  Login URL
                </label>
                <input
                  id="login-url"
                  type="url"
                  value={externalForm.loginUrl}
                  onChange={(e) => setExternalForm((f) => ({ ...f, loginUrl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label htmlFor="leads-url" className="block text-sm font-medium text-neutral-700">
                  Leads URL
                </label>
                <input
                  id="leads-url"
                  type="url"
                  value={externalForm.leadsUrl}
                  onChange={(e) => setExternalForm((f) => ({ ...f, leadsUrl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                  placeholder="https://..."
                />
              </div>

              {/* Extraction Configuration (optional) */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/50">
                <button
                  type="button"
                  onClick={() =>
                    setExternalForm((f) => ({ ...f, extractionOpen: !f.extractionOpen }))
                  }
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  {externalForm.extractionOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  Extraction Configuration (optional)
                </button>
                {externalForm.extractionOpen ? (
                  <div className="space-y-3 border-t border-neutral-200 px-3 pb-3 pt-2">
                    <div>
                      <label
                        htmlFor="extraction-lead-card"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Lead card selector
                      </label>
                      <input
                        id="extraction-lead-card"
                        type="text"
                        value={externalForm.extractionConfig.leadCardSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              leadCardSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="article.job-card"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-title"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Title selector
                      </label>
                      <input
                        id="extraction-title"
                        type="text"
                        value={externalForm.extractionConfig.titleSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              titleSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="h2.title"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-description"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Description selector
                      </label>
                      <input
                        id="extraction-description"
                        type="text"
                        value={externalForm.extractionConfig.descriptionSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              descriptionSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder=".description"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-suburb"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Suburb selector
                      </label>
                      <input
                        id="extraction-suburb"
                        type="text"
                        value={externalForm.extractionConfig.suburbSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              suburbSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder=".suburb"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-postcode"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Postcode selector
                      </label>
                      <input
                        id="extraction-postcode"
                        type="text"
                        value={externalForm.extractionConfig.postcodeSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              postcodeSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder=".postcode"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-external-id"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        External ID selector
                      </label>
                      <input
                        id="extraction-external-id"
                        type="text"
                        value={externalForm.extractionConfig.externalIdSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              externalIdSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="[data-id]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-external-id-attr"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        External ID attribute
                      </label>
                      <input
                        id="extraction-external-id-attr"
                        type="text"
                        value={externalForm.extractionConfig.externalIdAttribute}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              externalIdAttribute: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="data-id or href"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-detail-link"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Detail link selector
                      </label>
                      <input
                        id="extraction-detail-link"
                        type="text"
                        value={externalForm.extractionConfig.detailLinkSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              detailLinkSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="a.detail-link"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="extraction-posted-at"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Posted at selector
                      </label>
                      <input
                        id="extraction-posted-at"
                        type="text"
                        value={externalForm.extractionConfig.postedAtSelector}
                        onChange={(e) =>
                          setExternalForm((f) => ({
                            ...f,
                            extractionConfig: {
                              ...f.extractionConfig,
                              postedAtSelector: e.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        placeholder="time.posted"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="extraction-debug"
                        type="checkbox"
                        checked={externalForm.extractionDebug}
                        onChange={(e) =>
                          setExternalForm((f) => ({ ...f, extractionDebug: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-neutral-400"
                      />
                      <label htmlFor="extraction-debug" className="text-sm text-neutral-700">
                        Capture debug snippet for troubleshooting
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="px-3 pb-2.5 text-sm text-neutral-500">
                    {externalForm.extractionConfig.leadCardSelector.trim()
                      ? "Configured"
                      : "Not configured"}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Rule Set */}
          <div>
            <label htmlFor="rule-set" className="block text-sm font-medium text-neutral-700">
              Rule Set
            </label>
            <select
              id="rule-set"
              value={isSystemSource ? systemForm.ruleSetId : externalForm.ruleSetId}
              onChange={(e) => handleRuleSetChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            >
              <option value="">None</option>
              {ruleSets.map((rs) => (
                <option key={rs.id} value={rs.id}>
                  {rs.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scan Frequency */}
          <div>
            <label htmlFor="scan-frequency" className="block text-sm font-medium text-neutral-700">
              Scan Frequency (minutes)
            </label>
            <input
              id="scan-frequency"
              type="number"
              min={1}
              value={isSystemSource ? systemForm.scanFrequency : externalForm.scanFrequency}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 15;
                if (isSystemSource) setSystemForm((f) => ({ ...f, scanFrequency: v }));
                else setExternalForm((f) => ({ ...f, scanFrequency: v }));
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
              placeholder="15"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={isSystemSource ? systemForm.active : externalForm.active}
              onClick={() => {
                if (isSystemSource) setSystemForm((f) => ({ ...f, active: !f.active }));
                else setExternalForm((f) => ({ ...f, active: !f.active }));
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
                (isSystemSource ? systemForm.active : externalForm.active)
                  ? "border-accent bg-accent"
                  : "border-neutral-300 bg-neutral-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  (isSystemSource ? systemForm.active : externalForm.active)
                    ? "translate-x-5"
                    : "translate-x-0.5"
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
            {editingSource ? "Save Changes" : "Save Source"}
          </button>
        </div>
      </div>
    </div>
  );
}
