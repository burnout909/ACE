import type { AiEvaluation, ChecklistQuestion as Question, Score, TranscriptSegment } from "@/lib/types";
import { parseTimestamp } from "@/lib/time";

type ChecklistQuestionProps = {
  question: Question;
  answer?: Score;
  onAnswer: (id: string, value: Score) => void;
  aiEvaluation?: AiEvaluation;
  showAi: boolean;
  aiLoading: boolean;
  onTimestampClick?: (seconds: number) => void;
  transcript: TranscriptSegment[];
};

function findTranscriptText(
  stamp: string,
  transcript: TranscriptSegment[]
): string | null {
  const seconds = parseTimestamp(stamp);
  if (seconds === null) return null;
  const segment = transcript.find((s) => seconds >= s.start && seconds < s.end);
  return segment?.text ?? null;
}

export default function ChecklistQuestion({
  question,
  answer,
  onAnswer,
  aiEvaluation,
  showAi,
  aiLoading,
  onTimestampClick,
  transcript
}: ChecklistQuestionProps) {
  const evidence = aiEvaluation?.evidence ?? [];
  const hasEvidence = evidence.length > 0;

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        hasEvidence ? "border-sky-400" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {question.title}
          </h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAnswer(question.id, 1)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              answer === 1
                ? "border-slate-900 bg-slate-900 text-white active:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 active:border-slate-500 active:bg-slate-100"
            }`}
          >
            1점
          </button>
          <button
            onClick={() => onAnswer(question.id, 0)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              answer === 0
                ? "border-slate-900 bg-slate-900 text-white active:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 active:border-slate-500 active:bg-slate-100"
            }`}
          >
            0점
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
                  Evidence
                </span>
              </div>
              {evidence.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <div className="space-y-2">
                  {evidence.map((stamp) => {
                    const seconds = parseTimestamp(stamp);
                    const disabled = !onTimestampClick || seconds === null;
                    const transcriptText = findTranscriptText(stamp, transcript);
                    return (
                      <div key={stamp} className="space-y-1">
                        <button
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
                        {transcriptText && (
                          <p className="ml-1 text-[11px] leading-relaxed text-slate-500">
                            {transcriptText}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <span>No AI evaluation available.</span>
          )}
        </div>
      )}
    </div>
  );
}
