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
      <nav
        className="-mb-px flex gap-4 overflow-x-auto py-1 scrollbar-thin md:gap-6 md:overflow-visible md:py-0"
        aria-label="Lead management sections"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-h-[44px] shrink-0 border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors md:px-0 md:pb-3 md:pt-0 ${
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
