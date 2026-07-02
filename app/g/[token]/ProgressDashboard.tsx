"use client";

import { useEffect, useState } from "react";

type CaseState = "not_started" | "in_progress" | "submitted" | "locked";

type ProgressCase = {
  assignmentId: number;
  orderIndex: number;
  state: CaseState;
};

type ProgressData = {
  total: number;
  done: number;
  cases: ProgressCase[];
};

const STATE_LABEL: Record<CaseState, string> = {
  not_started: "미시작",
  in_progress: "진행중",
  submitted: "제출완료",
  locked: "잠금",
};

const STATE_CLASS: Record<CaseState, string> = {
  not_started: "bg-slate-100 text-slate-500 border-slate-200",
  in_progress: "bg-blue-50 text-blue-600 border-blue-200",
  submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  locked: "bg-slate-200 text-slate-400 border-slate-300",
};

export default function ProgressDashboard() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/progress");
        if (!res.ok) throw new Error("progress fetch failed");
        const json = (await res.json()) as ProgressData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-slate-400">진행 현황을 불러오는 중...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-red-400">진행 현황을 불러올 수 없습니다.</p>
      </div>
    );
  }

  const pct = data.total > 0 ? (data.done / data.total) * 100 : 0;

  return (
    <div className="w-full max-w-xl mx-auto mt-6 px-4">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-slate-700">
            {data.done} / {data.total} 케이스 완료
          </span>
          <span className="text-xs text-slate-400">{Math.round(pct)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-case chip grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {data.cases.map((c) => (
          <div
            key={c.assignmentId}
            className={`rounded-md border px-1.5 py-1 text-center text-[10px] font-medium leading-tight ${STATE_CLASS[c.state]}`}
            title={`케이스 ${c.orderIndex + 1}: ${STATE_LABEL[c.state]}`}
          >
            <div className="text-[11px] font-semibold">{c.orderIndex + 1}</div>
            <div className="mt-0.5 truncate">{STATE_LABEL[c.state]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
