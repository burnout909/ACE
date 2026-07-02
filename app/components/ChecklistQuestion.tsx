"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { StudyChecklistItem, TranscriptSegment } from "@/lib/types";
import { logEvent } from "@/lib/events/client";

type ChecklistQuestionProps = {
  item: StudyChecklistItem;
  answer?: number;
  onAnswer: (id: string, value: number) => void;
  mode: "A" | "B";
  onTimestampClick?: (seconds: number) => void;
  transcript: TranscriptSegment[];
  evidence?: string[];
};

// Scale-aware button config
const BINARY_BUTTONS = [
  { value: 1, label: "예" },
  { value: 0, label: "아니오" },
] as const;

const TRIPLE_BUTTONS = [
  { value: 3, label: "우수" },
  { value: 2, label: "보통" },
  { value: 1, label: "미흡" },
] as const;

export default function ChecklistQuestion({
  item,
  answer,
  onAnswer,
  mode,
  onTimestampClick,
  transcript: _transcript,
  evidence,
}: ChecklistQuestionProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, evidence]);

  /** Toggle expansion; emit item_focus when opening, evidence_view (Mode B) if evidence is visible. */
  const handleToggleExpand = useCallback(() => {
    if (!expanded) {
      // Expanding — emit item_focus
      logEvent("item_focus", { itemId: item.id }, { section: item.section });
      // Mode B + evidence present: emit evidence_view
      if (mode === "B" && evidence !== undefined && evidence.length > 0) {
        logEvent("evidence_view", { itemId: item.id, evidenceCount: evidence.length }, { section: item.section });
      }
    }
    setExpanded((prev) => !prev);
  }, [expanded, item.id, item.section, mode, evidence]);

  /** Wrap onAnswer to emit item_decide / item_revise. */
  const handleAnswerWithTracking = useCallback(
    (value: number) => {
      if (answer === undefined) {
        // First selection
        logEvent("item_decide", { itemId: item.id, value }, { section: item.section });
      } else if (answer === value) {
        // Deselect (toggle-off same button)
        logEvent("item_revise", { itemId: item.id, from: answer, to: null }, { section: item.section });
      } else {
        // Switch to a different value
        logEvent("item_revise", { itemId: item.id, from: answer, to: value }, { section: item.section });
      }
      onAnswer(item.id, value);
    },
    [answer, item.id, item.section, onAnswer],
  );

  const buttons = item.scale === "binary" ? BINARY_BUTTONS : TRIPLE_BUTTONS;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200">
      {/* Header — always visible, clickable to toggle criteria */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
        className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <h3
            className={`font-semibold text-slate-900 transition-all duration-200 ${
              expanded ? "text-base" : "truncate text-sm"
            }`}
          >
            {item.text}
          </h3>
        </div>

        {/* Scale-aware answer buttons */}
        <div
          className="flex shrink-0 gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {buttons.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleAnswerWithTracking(value)}
              className={`min-w-[44px] rounded-lg border-2 px-2.5 py-0.5 text-sm font-bold transition-all ${
                answer === value
                  ? "border-yonsei-500 bg-yonsei-500 text-white hover:bg-yonsei-800 active:bg-yonsei-900"
                  : "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Expandable body — shows criteria and (in Mode B only) evidence if provided */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? `${contentHeight}px` : "0px" }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          <p className="text-sm text-slate-700">{item.criteria}</p>

          {/* Evidence block: only in Mode B AND when evidence is provided.
              In Plan 1 there is no evidence source, so evidence is always undefined
              and nothing renders here — that is expected. */}
          {mode === "B" && evidence !== undefined && (
            <div className="mt-4 text-sm text-slate-600">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                근거
              </span>
              {evidence.length === 0 ? (
                <span className="ml-2 text-slate-500">없음</span>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {evidence.map((stamp) => (
                    <div key={stamp} className="flex items-baseline gap-2 rounded-md px-2 py-1">
                      <button
                        type="button"
                        disabled={!onTimestampClick}
                        onClick={() => {
                          if (onTimestampClick) {
                            // Parse timestamp string to seconds (assume "MM:SS" or pure seconds)
                            const parts = stamp.split(":").map(Number);
                            const seconds =
                              parts.length === 2
                                ? parts[0] * 60 + parts[1]
                                : parts[0] ?? 0;
                            // Apply −10s correction
                            onTimestampClick(Math.max(0, seconds - 10));
                          }
                        }}
                        className={
                          onTimestampClick
                            ? "text-[13px] font-semibold text-yonsei-500 underline hover:text-yonsei-700"
                            : "text-[13px] font-semibold text-slate-400"
                        }
                      >
                        {stamp}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
