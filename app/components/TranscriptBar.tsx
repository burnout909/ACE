"use client";

import { useEffect, useMemo, useRef } from "react";
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

  useEffect(() => {
    if (activeIndex >= 0) {
      itemRefs.current[activeIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    }
  }, [activeIndex]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Transcript
        </p>
      </div>
      <div className="mt-2 max-h-44 overflow-y-auto pr-2">
        {segments.length === 0 ? (
          <span className="text-sm text-slate-500">Transcript loading...</span>
        ) : (
          <div className="space-y-2">
            {segments.map((segment, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={segment.id}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  onClick={() => onTimestampClick(segment.start)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    isActive
                      ? "border-sky-400 bg-sky-50 text-slate-900"
                      : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                  } ${isActive ? "opacity-100" : "opacity-45"}`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {segment.timestamp}
                    </span>
                    <span className="text-sm text-slate-700">
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
