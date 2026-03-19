import type { ChecklistTab } from "@/lib/types";

type EvaluationTabsProps = {
  tabs: ChecklistTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
};

export default function EvaluationTabs({
  tabs,
  activeTabId,
  onSelect
}: EvaluationTabsProps) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-all ${
              isActive
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
