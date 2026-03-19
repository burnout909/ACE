"use client";

import { useRef, useState, useEffect } from "react";
import type { AiEvaluation, ChecklistQuestion as Question, Score, TranscriptSegment } from "@/lib/types";
import { formatTimestamp, parseTimestamp } from "@/lib/time";

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

function findTranscriptSegment(
  stamp: string,
  transcript: TranscriptSegment[]
): TranscriptSegment | null {
  const seconds = parseTimestamp(stamp);
  if (seconds === null) return null;
  return transcript.find((s) => seconds >= s.start && seconds < s.end) ?? null;
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
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, showAi, aiEvaluation, evidence]);

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-all duration-200 ${
        showAi && hasEvidence ? "border-yonsei-200" : "border-slate-200"
      }`}
    >
      {/* Header — always visible, clickable to toggle */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold text-slate-900 transition-all duration-200 ${expanded ? "text-base" : "truncate text-sm"}`}>
            {question.title}
          </h3>
        </div>
        <div
          className="flex shrink-0 gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {([3, 2, 1] as const).map((score) => (
            <button
              key={score}
              onClick={() => onAnswer(question.id, score)}
              className={`min-w-[36px] rounded-lg border-2 px-2.5 py-0.5 text-sm font-bold transition-all ${
                answer === score
                  ? "border-yonsei-500 bg-yonsei-500 text-white hover:bg-yonsei-800 active:bg-yonsei-900"
                  : "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100"
              }`}
            >
              {score}
            </button>
          ))}
        </div>
      </div>

      {/* Expandable content */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? `${contentHeight}px` : "0px" }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          <p className="text-sm text-slate-700">{question.criteria}</p>

          {showAi && (
            <div className="mt-4 text-sm text-slate-600">
              {aiLoading ? (
                <span>AI 평가 진행 중...</span>
              ) : aiEvaluation ? (
                <div className="space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    근거
                  </span>
                  {evidence.length === 0 ? (
                    <span className="ml-2 text-slate-500">없음</span>
                  ) : (
                    <div className="space-y-1.5">
                      {evidence.map((stamp) => {
                        const seconds = parseTimestamp(stamp);
                        const disabled = !onTimestampClick || seconds === null;
                        const seg = findTranscriptSegment(stamp, transcript);
                        const startLabel = seg ? formatTimestamp(seg.start) : stamp;
                        const endLabel = seg ? formatTimestamp(seg.end) : null;
                        const endSeconds = seg ? seg.end : null;
                        const isDoctor =
                          seg?.speaker != null &&
                          /^(speaker\s*1|a)\b/i.test(seg.speaker);
                        return (
                          <div key={stamp} className={`flex items-baseline gap-2 rounded-md px-2 py-1 ${isDoctor ? "bg-blue-50" : ""}`}>
                            <span className="shrink-0 text-[13px] font-semibold">
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  if (seconds !== null && onTimestampClick) {
                                    onTimestampClick(seconds);
                                  }
                                }}
                                className={disabled ? "text-slate-400" : "text-yonsei-500 underline hover:text-yonsei-700"}
                              >
                                {startLabel}
                              </button>
                              {endLabel && (
                                <>
                                  <span className="text-slate-400"> ~ </span>
                                  <button
                                    type="button"
                                    disabled={!onTimestampClick || endSeconds === null}
                                    onClick={() => {
                                      if (endSeconds !== null && onTimestampClick) {
                                        onTimestampClick(endSeconds);
                                      }
                                    }}
                                    className={disabled ? "text-slate-400" : "text-yonsei-500 underline hover:text-yonsei-700"}
                                  >
                                    {endLabel}
                                  </button>
                                </>
                              )}
                            </span>
                            {seg && (
                              <span className="flex items-baseline gap-1.5">
                                {seg.speaker && (
                                  <span
                                    className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${
                                      isDoctor
                                        ? "bg-blue-100 text-blue-600"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {isDoctor ? "의사" : "환자"}
                                  </span>
                                )}
                                <span className="text-[13px] leading-relaxed text-slate-600">
                                  {seg.text}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <span>AI 평가 없음</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
