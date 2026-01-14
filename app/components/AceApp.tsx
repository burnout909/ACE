"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ViewGrid from "./ViewGrid";
import TranscriptBar from "./TranscriptBar";
import EvaluationPanel from "./EvaluationPanel";
import type {
  AiEvaluation,
  ChecklistData,
  TranscriptSegment
} from "@/lib/types";
import { formatTimestamp } from "@/lib/time";

const ANSWERS_KEY = "ace-evaluator-answers";
const TRANSCRIPT_ENDPOINT = "/route/transcript";
const EVALUATION_ENDPOINT = "/route/evaluate";
export default function AceApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeView, setActiveView] = useState("view1");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [aiEvaluation, setAiEvaluation] = useState<AiEvaluation[]>([]);
  const [aiFromFile, setAiFromFile] = useState(false);
  const [showAi, setShowAi] = useState(true);
  const [answers, setAnswers] = useState<Record<string, "Yes" | "No">>({});
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch("/checklist.json")
      .then((res) => res.json())
      .then((data: ChecklistData) => setChecklist(data))
      .catch(() => setChecklist(null));
  }, []);

  useEffect(() => {
    fetch(TRANSCRIPT_ENDPOINT)
      .then((res) => res.json())
      .then((data: { segments: TranscriptSegment[] }) => {
        setTranscript(data.segments ?? []);
      })
      .catch(() => setTranscript([]));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(ANSWERS_KEY);
    if (stored) {
      try {
        setAnswers(JSON.parse(stored));
      } catch {
        setAnswers({});
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    fetch(EVALUATION_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { evaluations?: AiEvaluation[] } | null) => {
        if (data?.evaluations && Array.isArray(data.evaluations)) {
          setAiEvaluation(data.evaluations);
          setAiFromFile(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (aiFromFile || aiEvaluation.length > 0 || aiLoading) {
      return;
    }
    if (!checklist || transcript.length === 0) {
      return;
    }
    setAiLoading(true);
    fetch(EVALUATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist, transcript })
    })
      .then((res) => res.json())
      .then((data: { evaluations?: AiEvaluation[]; source?: string }) => {
        const evaluations = Array.isArray(data.evaluations)
          ? data.evaluations
          : [];
        setAiEvaluation(evaluations);
        if (data.source === "file") {
          setAiFromFile(true);
        }
      })
      .catch(() => setAiEvaluation([]))
      .finally(() => setAiLoading(false));
  }, [aiEvaluation.length, aiFromFile, aiLoading, checklist, transcript]);

  const totalQuestions = useMemo(() => {
    if (!checklist) {
      return 0;
    }
    return checklist.tabs.reduce(
      (count, tab) => count + tab.questions.length,
      0
    );
  }, [checklist]);

  const answeredCount = useMemo(() => {
    if (!checklist) {
      return 0;
    }
    return checklist.tabs.reduce((count, tab) => {
      return (
        count +
        tab.questions.filter((question) => answers[question.id]).length
      );
    }, 0);
  }, [answers, checklist]);

  const isComplete = totalQuestions > 0 && answeredCount === totalQuestions;

  const handleTimestampClick = (seconds: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = seconds;
      video.play().catch(() => undefined);
    }
    setActiveView("view1");
    setLastSynced(formatTimestamp(seconds));
  };

  const handleAnswer = (id: string, value: "Yes" | "No") => {
    setAnswers((prev) => {
      if (prev[id] === value) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: value };
    });
  };

  const handleComplete = () => {
    const payload = {
      answers,
      aiEvaluation,
      completedAt: new Date().toISOString()
    };
    console.log("ACE evaluation", payload);
  };

  return (
    <main className="relative min-h-screen overflow-x-auto px-8 py-6">
      <div className="absolute inset-0 -z-10 opacity-80" aria-hidden="true">
        <div className="absolute left-10 top-10 h-48 w-48 rounded-full bg-[#f5f0e6] blur-3xl" />
        <div className="absolute right-24 top-8 h-64 w-64 rounded-full bg-[#e1f0ff] blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#eef7ee] blur-3xl" />
      </div>

      {/* <header className="mb-6 flex min-w-[1080px] items-end">
        <h1 className="font-display text-3xl font-bold text-slate-900">
          ACE
        </h1>
      </header> */}

      <div className="grid min-w-[1080px] grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="flex flex-col gap-4">
          <ViewGrid
            activeView={activeView}
            onActivate={setActiveView}
            videoRef={videoRef}
            lastSynced={lastSynced}
            onTimeUpdate={setCurrentTime}
          />
          <TranscriptBar
            segments={transcript}
            currentTime={currentTime}
            onTimestampClick={handleTimestampClick}
          />
        </section>
        <EvaluationPanel
          checklist={checklist}
          answers={answers}
          onAnswer={handleAnswer}
          aiEvaluation={aiEvaluation}
          showAi={showAi}
          onToggleAi={() => setShowAi((prev) => !prev)}
          aiLoading={aiLoading}
          answeredCount={answeredCount}
          totalQuestions={totalQuestions}
          onComplete={handleComplete}
          isComplete={isComplete}
          onTimestampClick={handleTimestampClick}
        />
      </div>
    </main>
  );
}
