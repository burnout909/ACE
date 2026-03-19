"use client";

import { useMemo, useRef } from "react";
import type { TranscriptSegment } from "@/lib/types";

type TranscriptBarProps = {
  segments: TranscriptSegment[];
  currentTime: number;
  onTimestampClick: (seconds: number) => void;
};

export default function TranscriptBar({
  segments,
  currentTime,
  onTimestampClick
}: TranscriptBarProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = useMemo(() => {
    return segments.findIndex(
      (segment) => currentTime >= segment.start && currentTime < segment.end
    );
  }, [currentTime, segments]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {segments.length === 0 ? (
          <span className="text-sm text-slate-500">발화 기록 불러오는 중...</span>
        ) : (
          <div className="space-y-1">
            {segments.map((segment, index) => {
              const isActive = index === activeIndex;
              const isDoctor =
                segment.speaker != null &&
                /^(doctor|speaker\s*1|a)\b/i.test(segment.speaker);
              return (
                <button
                  key={segment.id}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  onClick={() => onTimestampClick(segment.start)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "border-yonsei-200 bg-yonsei-50"
                      : isDoctor
                        ? "border-blue-100 bg-blue-50/60"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-baseline gap-3">
                    {segment.speaker && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          isDoctor
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isDoctor ? "의사" : "환자"}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                        isActive ? "text-yonsei-500" : "text-slate-400"
                      }`}
                    >
                      {segment.timestamp}
                    </span>
                    <span
                      className={`text-sm ${
                        isActive
                          ? "font-medium text-slate-900"
                          : "text-slate-700"
                      }`}
                    >
                      {segment.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
