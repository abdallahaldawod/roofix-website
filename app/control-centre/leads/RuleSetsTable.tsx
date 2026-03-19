"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { LeadRuleSet, LeadRuleSetStatus } from "@/lib/leads/types";

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

type RuleSetsTableProps = {
  ruleSets: RuleSet[];
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
};

export function RuleSetsTable({ ruleSets, onSelect, onEdit, onCreate, onDelete }: RuleSetsTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Rule Sets</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Define matching and scoring rules applied to lead sources.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
        >
          Create Rule Set
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {/* Mobile: card list */}
        <div className="space-y-3 p-4 md:hidden">
          {ruleSets.map((rs) => (
            <div
              key={rs.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-4"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(rs.id)}
                  className="text-left font-medium text-neutral-900 hover:underline"
                >
                  {rs.name}
                </button>
                {rs.description ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">{rs.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RuleSetStatusBadge status={rs.status} />
                  <span className="text-xs text-neutral-500">
                    {rs.sourcesUsing} source{rs.sourcesUsing === 1 ? "" : "s"} · min score {rs.minScore}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Edit rule set"
                  onClick={() => onEdit(rs.id)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete rule set"
                  onClick={() => onDelete(rs.id)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-neutral-100">
            <thead className="bg-neutral-50/80">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Sources Using
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Min Score
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {ruleSets.map((rs) => (
                <tr key={rs.id} className="text-sm">
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(rs.id)}
                      className="cursor-pointer font-medium text-neutral-900 hover:underline"
                    >
                      {rs.name}
                    </button>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-neutral-600">
                    {rs.description}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                    {rs.sourcesUsing}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                    {rs.minScore}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <RuleSetStatusBadge status={rs.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Edit rule set"
                        onClick={() => onEdit(rs.id)}
                        className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete rule set"
                        onClick={() => onDelete(rs.id)}
                        className="flex h-9 w-9 min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
