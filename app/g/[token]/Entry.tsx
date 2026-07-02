"use client";

import { useState } from "react";
import CaseRunner from "./CaseRunner";

type EntryProps = { token: string };
type SessionInfo = { raterId: string; period: number };
type Status = "pin" | "confirm" | "grading";

export default function Entry({ token }: EntryProps) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status>("pin");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const handlePinSubmit = async () => {
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const data = (await res.json()) as {
        error?: string;
        raterId?: string;
        period?: number;
      };

      if (res.ok) {
        setSession({ raterId: data.raterId!, period: data.period! });
        setStatus("confirm");
      } else {
        const errCode = data.error;
        if (errCode === "invalid_token") {
          setError("링크가 유효하지 않습니다.");
        } else if (errCode === "bad_pin") {
          setError("PIN이 올바르지 않습니다.");
        } else if (errCode === "session_not_active") {
          setError("지금은 채점 세션이 열려있지 않습니다.");
        } else {
          setError("오류가 발생했습니다. 다시 시도해 주세요.");
        }
        setStatus("pin");
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
      setStatus("pin");
    }
  };

  if (status === "grading" && session) {
    return <CaseRunner token={token} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="absolute inset-0 -z-10 opacity-60" aria-hidden="true">
        <div className="absolute left-10 top-10 h-48 w-48 rounded-full bg-[#f5f0e6] blur-3xl" />
        <div className="absolute right-24 top-8 h-64 w-64 rounded-full bg-[#e1f0ff] blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#eef7ee] blur-3xl" />
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-lg backdrop-blur-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">ACE CPX 채점</h1>
          <p className="mt-1 text-sm text-slate-500">연세대학교 의과대학</p>
        </div>

        {status === "pin" && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="pin"
                className="block text-sm font-medium text-slate-700"
              >
                PIN 입력
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, ""))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pin.length >= 4) {
                    void handlePinSubmit();
                  }
                }}
                placeholder="••••••"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-mono tracking-[0.4em] text-slate-900 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              onClick={() => void handlePinSubmit()}
              disabled={pin.length < 4}
              className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                pin.length >= 4
                  ? "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
            >
              확인
            </button>
          </div>
        )}

        {status === "confirm" && session && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 px-5 py-4 text-center">
              <p className="text-base font-semibold text-slate-900">
                {session.raterId} 교수님으로 채점을 시작합니다
              </p>
              <p className="mt-1 text-sm text-slate-500">
                본인이 맞으시면 확인을 눌러주세요.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStatus("pin");
                  setPin("");
                }}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                아니오
              </button>
              <button
                onClick={() => setStatus("grading")}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-950"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
