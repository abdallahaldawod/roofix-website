"use client";

export type LeadTab = "sources" | "rule-sets" | "activity" | "settings";

const TABS: { id: LeadTab; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "rule-sets", label: "Rule Sets" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

type LeadManagementTabsProps = {
  activeTab: LeadTab;
  onChange: (tab: LeadTab) => void;
};

export function LeadManagementTabs({ activeTab, onChange }: LeadManagementTabsProps) {
  return (
    <div className="border-b border-neutral-200">
      <nav className="-mb-px flex gap-6" aria-label="Lead management sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
