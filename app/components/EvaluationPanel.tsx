"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiEvaluation, ChecklistData, Score, TranscriptSegment } from "@/lib/types";
import EvaluationTabs from "./EvaluationTabs";
import ChecklistQuestion from "./ChecklistQuestion";

type EvaluationPanelProps = {
  checklist: ChecklistData | null;
  answers: Record<string, Score>;
  onAnswer: (id: string, value: Score) => void;
  aiEvaluation: AiEvaluation[];
  showAi: boolean;
  onToggleAi: () => void;
  aiLoading: boolean;
  answeredCount: number;
  totalQuestions: number;
  onComplete: () => void;
  isComplete: boolean;
  onTimestampClick?: (seconds: number) => void;
  transcript: TranscriptSegment[];
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
  onTimestampClick,
  transcript
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
    <aside className="flex h-full flex-col p-4">
      <div className="flex items-end justify-between">
        <EvaluationTabs
          tabs={checklist?.tabs ?? []}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
        />
        <button
          onClick={onToggleAi}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-yonsei-50 px-3 py-2 text-sm font-semibold text-yonsei-700 transition-colors hover:bg-yonsei-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
          {showAi ? "AI-evidence 숨기기" : "AI-evidence 보기"}
        </button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        {!activeTab ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            체크리스트 불러오는 중...
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
