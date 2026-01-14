import type { AiEvaluation, ChecklistQuestion as Question } from "@/lib/types";
import { parseTimestamp } from "@/lib/time";

type ChecklistQuestionProps = {
  question: Question;
  answer?: "Yes" | "No";
  onAnswer: (id: string, value: "Yes" | "No") => void;
  aiEvaluation?: AiEvaluation;
  showAi: boolean;
  aiLoading: boolean;
  onTimestampClick?: (seconds: number) => void;
};

export default function ChecklistQuestion({
  question,
  answer,
  onAnswer,
  aiEvaluation,
  showAi,
  aiLoading,
  onTimestampClick
}: ChecklistQuestionProps) {
  const evidence = aiEvaluation?.evidence ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {question.title}
          </h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAnswer(question.id, "Yes")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              answer === "Yes"
                ? "border-slate-900 bg-slate-900 text-white active:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 active:border-slate-500 active:bg-slate-100"
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => onAnswer(question.id, "No")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              answer === "No"
                ? "border-slate-900 bg-slate-900 text-white active:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 active:border-slate-500 active:bg-slate-100"
            }`}
          >
            No
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">{question.criteria}</p>

      {showAi && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {aiLoading ? (
            <span>AI evaluation in progress...</span>
          ) : aiEvaluation ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  AI
                </span>
                <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {aiEvaluation.aiAnswer}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Evidence
                </span>
                {evidence.length === 0 ? (
                  <span className="text-slate-500">None</span>
                ) : (
                  evidence.map((stamp) => {
                    const seconds = parseTimestamp(stamp);
                    const disabled = !onTimestampClick || seconds === null;
                    return (
                      <button
                        key={stamp}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (seconds !== null && onTimestampClick) {
                            onTimestampClick(seconds);
                          }
                        }}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          disabled
                            ? "border-slate-200 text-slate-400"
                            : "border-sky-300 bg-sky-100 text-sky-800 hover:border-sky-400 hover:bg-sky-200 hover:text-sky-900 active:border-sky-500 active:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                        }`}
                      >
                        {stamp}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <span>No AI evaluation available.</span>
          )}
        </div>
      )}
    </div>
  );
}
