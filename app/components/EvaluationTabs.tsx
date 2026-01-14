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
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isActive
                ? "border-sky-400 bg-sky-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-slate-50 active:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
