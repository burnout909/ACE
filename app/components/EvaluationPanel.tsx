"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiEvaluation, ChecklistData } from "@/lib/types";
import EvaluationTabs from "./EvaluationTabs";
import ChecklistQuestion from "./ChecklistQuestion";

type EvaluationPanelProps = {
  checklist: ChecklistData | null;
  answers: Record<string, "Yes" | "No">;
  onAnswer: (id: string, value: "Yes" | "No") => void;
  aiEvaluation: AiEvaluation[];
  showAi: boolean;
  onToggleAi: () => void;
  aiLoading: boolean;
  answeredCount: number;
  totalQuestions: number;
  onComplete: () => void;
  isComplete: boolean;
  onTimestampClick?: (seconds: number) => void;
};

export default function EvaluationPanel({
  checklist,
  answers,
  onAnswer,
  aiEvaluation,
  showAi,
  onToggleAi,
  aiLoading,
  answeredCount,
  totalQuestions,
  onComplete,
  isComplete,
  onTimestampClick
}: EvaluationPanelProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    if (!checklist || checklist.tabs.length === 0) {
      return;
    }
    if (!activeTabId || !checklist.tabs.find((tab) => tab.id === activeTabId)) {
      setActiveTabId(checklist.tabs[0].id);
    }
  }, [activeTabId, checklist]);

  const aiMap = useMemo(() => {
    if (!Array.isArray(aiEvaluation)) {
      return new Map();
    }
    return new Map(aiEvaluation.map((entry) => [entry.questionId, entry]));
  }, [aiEvaluation]);

  const activeTab = checklist?.tabs.find((tab) => tab.id === activeTabId);

  return (
    <aside className="flex h-[calc(100vh-140px)] flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl text-slate-900">Checklist</h2>
        </div>
        <button
          onClick={onToggleAi}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 active:border-slate-400 active:bg-slate-100"
        >
          {showAi ? "Hide AI Evaluation" : "Show AI Evaluation"}
        </button>
      </div>

      <div className="mt-4">
        <EvaluationTabs
          tabs={checklist?.tabs ?? []}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
        />
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        {!activeTab ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Loading checklist questions...
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab.questions.map((question) => (
              <ChecklistQuestion
                key={question.id}
                question={question}
                answer={answers[question.id]}
                onAnswer={onAnswer}
                aiEvaluation={aiMap.get(question.id)}
                showAi={showAi}
                aiLoading={aiLoading}
                onTimestampClick={onTimestampClick}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Answered {answeredCount} / {totalQuestions}
          </span>
          <span>{isComplete ? "All complete" : "In progress"}</span>
        </div>
        <button
          onClick={onComplete}
          disabled={!isComplete}
          className={`mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
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
