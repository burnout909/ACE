"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SessionRow = {
  raterId: string;
  name: string;
  s1CompletedAt: number | null;
  eligible: boolean;
  s2Status: string;
  windowOpen: boolean;
};

export default function SessionsTable({ rows }: { rows: SessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function call(raterId: string, action: string, force = false) {
    setBusy(`${raterId}:${action}`);
    setError("");
    const res = await fetch("/api/admin/approve-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raterId, action, force }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(`${raterId}: ${j.error ?? res.status}`);
    }
  }

  const fmt = (t: number | null) =>
    t ? new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div>
      {error && <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", maxWidth: 820 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "6px 8px" }}>평가자</th>
            <th style={{ padding: "6px 8px" }}>S1 완료</th>
            <th style={{ padding: "6px 8px" }}>자격</th>
            <th style={{ padding: "6px 8px" }}>S2 상태</th>
            <th style={{ padding: "6px 8px" }}>액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = r.s2Status === "active" && r.windowOpen;
            return (
              <tr key={r.raterId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 8px" }}>
                  {r.name} <span style={{ color: "#9ca3af" }}>({r.raterId})</span>
                </td>
                <td style={{ padding: "6px 8px", color: r.s1CompletedAt ? "#111" : "#9ca3af" }}>
                  {fmt(r.s1CompletedAt)}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {r.s1CompletedAt == null ? (
                    <span style={{ color: "#9ca3af" }}>S1 미완</span>
                  ) : r.eligible ? (
                    <span style={{ color: "#166534" }}>충족</span>
                  ) : (
                    <span style={{ color: "#b45309" }}>워시아웃 전</span>
                  )}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {active ? (
                    <span style={{ color: "#166534" }}>● 개방</span>
                  ) : r.s2Status === "active" ? (
                    <span style={{ color: "#b45309" }}>◑ 윈도 닫힘</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>잠금</span>
                  )}
                </td>
                <td style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                  {r.s2Status !== "active" && (
                    <button
                      disabled={r.s1CompletedAt == null || !!busy}
                      onClick={() => {
                        if (!r.eligible) {
                          if (!confirm("워시아웃 기간 전입니다. 그래도 승인(강제)하시겠습니까? (감사로그 기록)")) return;
                          call(r.raterId, "approve", true);
                        } else {
                          call(r.raterId, "approve");
                        }
                      }}
                      style={btn("#111")}
                    >
                      {busy === `${r.raterId}:approve` ? "…" : "S2 승인"}
                    </button>
                  )}
                  {active && (
                    <button disabled={!!busy} onClick={() => call(r.raterId, "close")} style={btn("#b91c1c")}>
                      윈도 닫기
                    </button>
                  )}
                  {r.s2Status === "active" && !r.windowOpen && (
                    <button disabled={!!busy} onClick={() => call(r.raterId, "open")} style={btn("#166534")}>
                      윈도 열기
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 5,
    background: bg,
    color: "#fff",
    border: 0,
    fontSize: 12,
    cursor: "pointer",
  };
}
