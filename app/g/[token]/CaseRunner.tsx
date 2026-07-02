"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AceApp from "@/app/components/AceApp";
import type { CaseVideoUrls, StudyChecklistItem, TranscriptSegment, EvidenceItem } from "@/lib/types";
import { logEvent, setEventContext, setStorageNamespace, flush } from "@/lib/events/client";
import ProgressDashboard from "./ProgressDashboard";

type AssignmentSummary = {
  id: number;
  caseId: number;
  orderIndex: number;
  mode: string;
  state: string;
};

type CaseApiResponse = {
  assignment: {
    id: number;
    raterId: string;
    caseId: number;
    period: number;
    mode: string;
    orderIndex: number;
  };
  case: {
    id: number;
    videoUrls: CaseVideoUrls;
    phenotype: string;
  };
  items: StudyChecklistItem[];
  answers: { itemId: string; value: number }[];
  mode: "A" | "B";
  state: string;
  transcript?: TranscriptSegment[];
  evidence?: EvidenceItem[];
};

type LoadState = "loading" | "ready" | "done" | "error";

function isDone(state: string): boolean {
  return state === "submitted" || state === "locked";
}

export default function CaseRunner({ token }: { token: string }) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [caseData, setCaseData] = useState<CaseApiResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Namespace the event buffer by rater token so offline events from a
  // different rater session are never flushed under this one.
  useEffect(() => {
    setStorageNamespace(token);
  // token never changes for the lifetime of this component
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle detection refs
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);
  const IDLE_THRESHOLD_MS = 60_000;

  const fetchAssignments = useCallback(async (): Promise<AssignmentSummary[]> => {
    const res = await fetch("/api/assignments");
    if (!res.ok) throw new Error("assignments fetch failed");
    const data = (await res.json()) as { assignments: AssignmentSummary[] };
    return data.assignments;
  }, []);

  const loadNextCase = useCallback(
    async (list: AssignmentSummary[]) => {
      const next = list.find((a) => !isDone(a.state));
      if (!next) {
        setLoadState("done");
        return;
      }
      setCurrentId(next.id);
      const res = await fetch(`/api/case/${next.id}`);
      if (!res.ok) throw new Error("case fetch failed");
      const data = (await res.json()) as CaseApiResponse;
      setCaseData(data);
      setLoadState("ready");
    },
    []
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAssignments();
        if (cancelled) return;
        setAssignments(list);
        await loadNextCase(list);
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [fetchAssignments, loadNextCase]);

  // Emit case_enter when a new case loads; update ambient event context.
  useEffect(() => {
    if (!caseData) return;
    setEventContext({ assignmentId: caseData.assignment.id });
    logEvent("case_enter", {
      caseId: caseData.case.id,
      assignmentId: caseData.assignment.id,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.assignment.id]);

  // Heartbeat every 30 s while a case is open.
  useEffect(() => {
    if (!caseData) return;
    const interval = setInterval(() => {
      logEvent("heartbeat");
    }, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.assignment.id]);

  // Idle detection: emit idle_start after 60 s of no interaction; idle_end on resume.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const resetIdle = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        logEvent("idle_end");
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        logEvent("idle_start");
      }, IDLE_THRESHOLD_MS);
    };

    const interactionEvents = ["mousemove", "keydown", "touchstart", "click"] as const;
    for (const evt of interactionEvents) {
      window.addEventListener(evt, resetIdle, { passive: true });
    }
    resetIdle(); // start the first timer

    return () => {
      for (const evt of interactionEvents) {
        window.removeEventListener(evt, resetIdle);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  // Run once — idle detection is global for the session lifetime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any buffered events on unmount.
  useEffect(() => {
    return () => { void flush(); };
  }, []);

  const handleSubmit = useCallback(
    async (answers: { itemId: string; value: number }[]) => {
      if (!currentId) return;
      setSubmitError(null);

      // Record the submit intent before the API call.
      logEvent("case_submit", { assignmentId: currentId, answerCount: answers.length });

      try {
        const res = await fetch(`/api/case/${currentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        // 409 = already submitted — treat as success and advance
        if (!res.ok && res.status !== 409) {
          throw new Error("submit failed");
        }

        // Case is leaving; flush buffered events before advancing.
        logEvent("case_exit", { assignmentId: currentId });
        await flush();

        setLoadState("loading");
        setCaseData(null);
        const updatedList = await fetchAssignments();
        setAssignments(updatedList);
        await loadNextCase(updatedList);
      } catch {
        setSubmitError("제출 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    },
    [currentId, fetchAssignments, loadNextCase]
  );

  const total = assignments.length;
  const doneCount = assignments.filter((a) => isDone(a.state)).length;

  if (loadState === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">케이스를 불러오는 중...</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm text-center">
          <p className="text-sm font-medium text-red-600">
            데이터를 불러오는 중 오류가 발생했습니다.
          </p>
          <p className="mt-1 text-xs text-slate-500">페이지를 새로고침 해주세요.</p>
        </div>
      </div>
    );
  }

  if (loadState === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-16">
        <div className="absolute inset-0 -z-10 opacity-60" aria-hidden="true">
          <div className="absolute left-10 top-10 h-48 w-48 rounded-full bg-[#f5f0e6] blur-3xl" />
          <div className="absolute right-24 top-8 h-64 w-64 rounded-full bg-[#e1f0ff] blur-3xl" />
          <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#eef7ee] blur-3xl" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-10 shadow-lg text-center">
          <div className="mb-3 text-3xl text-slate-700">✓</div>
          <h2 className="text-lg font-bold text-slate-900">모든 케이스 채점 완료</h2>
          <p className="mt-2 text-sm text-slate-500">
            총 {total}개의 케이스를 모두 채점하셨습니다.
          </p>
        </div>
        <ProgressDashboard />
      </div>
    );
  }

  if (!caseData) return null;

  return (
    <div className="relative">
      {/* Fixed progress bar overlay */}
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center gap-4 bg-white/95 px-5 py-2 shadow-sm backdrop-blur-sm">
        <span className="shrink-0 text-sm font-medium text-slate-700">
          {doneCount} / {total}
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-700 transition-all duration-300"
            style={{
              width: total > 0 ? `${(doneCount / total) * 100}%` : "0%",
            }}
          />
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          케이스 {caseData.assignment.orderIndex + 1}
        </span>
      </div>

      {submitError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-50 px-5 py-3 shadow-lg">
          <p className="text-sm text-red-600">{submitError}</p>
        </div>
      )}

      {/* AceApp — key forces remount (state reset) when assignment changes */}
      <AceApp
        key={caseData.assignment.id}
        mode={caseData.mode}
        videoUrls={caseData.case.videoUrls}
        items={caseData.items}
        initialAnswers={caseData.answers}
        onSubmit={handleSubmit}
        transcript={caseData.transcript}
        evidence={caseData.evidence}
      />
    </div>
  );
}
