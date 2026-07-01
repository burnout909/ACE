"use client";

import { useState } from "react";
import type { StudyChecklistItem, TranscriptSegment } from "@/lib/types";
import EvaluationTabs from "./EvaluationTabs";
import ChecklistQuestion from "./ChecklistQuestion";

type EvaluationPanelProps = {
  mode: "A" | "B";
  items: StudyChecklistItem[];
  answers: Record<string, number>;
  onAnswer: (id: string, value: number) => void;
  onComplete: () => void;
  isComplete: boolean;
  onTimestampClick?: (seconds: number) => void;
  transcript: TranscriptSegment[];
};

const SECTION_TABS = [
  { id: "Hx", label: "병력 청취" },
  { id: "PEx", label: "신체 진찰" },
  { id: "Edu", label: "환자 교육" },
];

export default function EvaluationPanel({
  mode,
  items,
  answers,
  onAnswer,
  onComplete,
  isComplete,
  onTimestampClick,
  transcript,
}: EvaluationPanelProps) {
  const [activeSection, setActiveSection] = useState<string>("Hx");

  const sectionItems = items.filter((item) => item.section === activeSection);

  return (
    <aside className="flex h-full flex-col p-4">
      <div className="flex items-end">
        <EvaluationTabs
          tabs={SECTION_TABS}
          activeTabId={activeSection}
          onSelect={setActiveSection}
        />
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        {sectionItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            이 섹션에 항목이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {sectionItems.map((item) => (
              <ChecklistQuestion
                key={item.id}
                item={item}
                answer={answers[item.id]}
                onAnswer={onAnswer}
                mode={mode}
                onTimestampClick={onTimestampClick}
                transcript={transcript}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <button
          onClick={onComplete}
          disabled={!isComplete}
          className={`w-full rounded-xl px-4 py-2 text-sm font-semibold ${
            isComplete
              ? "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950"
              : "cursor-not-allowed bg-slate-200 text-slate-500"
          }`}
        >
          채점 완료
        </button>
      </div>
    </aside>
  );
}
