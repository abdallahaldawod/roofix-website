"use client";

import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string | number;
  status?: "Healthy" | "Error";
  icon?: LucideIcon;
};

export function StatCard({ title, value, status, icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {title}
          </p>
          <p className="mt-2 tabular-nums text-2xl font-bold text-neutral-900">{value}</p>
          {status && (
            <span
              className={`mt-2 inline-block text-xs font-medium ${
                status === "Healthy" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {status}
            </span>
          )}
        </div>
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}
