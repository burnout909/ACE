"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ViewGrid from "./ViewGrid";
import TranscriptBar from "./TranscriptBar";
import EvaluationPanel from "./EvaluationPanel";
import DragHandle from "./DragHandle";
import type { CaseVideoUrls, StudyChecklistItem, TranscriptSegment } from "@/lib/types";
import { formatTimestamp } from "@/lib/time";

export type AceAppProps = {
  mode: "A" | "B";
  videoUrls: CaseVideoUrls;
  items: StudyChecklistItem[];
  initialAnswers: { itemId: string; value: number }[];
  onSubmit: (answers: { itemId: string; value: number }[]) => Promise<void> | void;
};

export default function AceApp({
  mode,
  videoUrls,
  items,
  initialAnswers,
  onSubmit,
}: AceAppProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeView, setActiveView] = useState("view1");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // No transcript in Plan 1 (Plan 4 will wire evidence/transcript)
  const transcript: TranscriptSegment[] = [];

  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const { itemId, value } of initialAnswers) {
      map[itemId] = value;
    }
    return map;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidthPct, setLeftWidthPct] = useState(60);
  const [topHeightPct, setTopHeightPct] = useState(55);

  const handleHorizontalDrag = useCallback((delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const pct = (delta / container.clientWidth) * 100;
    setLeftWidthPct((prev) => Math.min(80, Math.max(30, prev + pct)));
  }, []);

  const handleVerticalDrag = useCallback((delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const pct = (delta / container.clientHeight) * 100;
    setTopHeightPct((prev) => Math.min(80, Math.max(20, prev + pct)));
  }, []);

  const totalQuestions = items.length;

  const answeredCount = useMemo(
    () => items.filter((item) => answers[item.id] !== undefined).length,
    [answers, items]
  );

  const isComplete = totalQuestions > 0 && answeredCount === totalQuestions;

  const handleTimestampClick = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = seconds;
      video.play().catch(() => undefined);
    }
    setActiveView("view1");
    setLastSynced(formatTimestamp(seconds));
  }, []);

  const handleAnswer = useCallback((id: string, value: number) => {
    setAnswers((prev) => {
      if (prev[id] === value) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: value };
    });
  }, []);

  const handleComplete = useCallback(() => {
    const answersArray = Object.entries(answers).map(([itemId, value]) => ({
      itemId,
      value,
    }));
    void onSubmit(answersArray);
  }, [answers, onSubmit]);

  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-80" aria-hidden="true">
        <div className="absolute left-10 top-10 h-48 w-48 rounded-full bg-[#f5f0e6] blur-3xl" />
        <div className="absolute right-24 top-8 h-64 w-64 rounded-full bg-[#e1f0ff] blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#eef7ee] blur-3xl" />
      </div>

      <div ref={containerRef} className="flex h-full min-w-[1080px]">
        {/* Left: Video + Transcript */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: `${leftWidthPct}%` }}
        >
          {/* Video panel */}
          <div
            className="overflow-hidden border-b border-r border-slate-200 bg-white/80"
            style={{ height: `${topHeightPct}%` }}
          >
            <div className="h-full p-3">
              <ViewGrid
                activeView={activeView}
                onActivate={setActiveView}
                videoRef={videoRef}
                lastSynced={lastSynced}
                onTimeUpdate={setCurrentTime}
                videoSrc={videoUrls.ceiling}
              />
            </div>
          </div>

          <DragHandle direction="vertical" onDrag={handleVerticalDrag} />

          {/* Transcript panel */}
          <div className="flex-1 overflow-hidden border-r border-slate-200 bg-white/80">
            <div className="h-full p-3">
              <TranscriptBar
                segments={transcript}
                currentTime={currentTime}
                onTimestampClick={handleTimestampClick}
              />
            </div>
          </div>
        </div>

        <DragHandle direction="horizontal" onDrag={handleHorizontalDrag} />

        {/* Right: Checklist panel */}
        <div className="flex-1 overflow-hidden bg-white/80">
          <EvaluationPanel
            mode={mode}
            items={items}
            answers={answers}
            onAnswer={handleAnswer}
            onComplete={handleComplete}
            isComplete={isComplete}
            onTimestampClick={handleTimestampClick}
            transcript={transcript}
          />
        </div>
      </div>
    </main>
  );
}
