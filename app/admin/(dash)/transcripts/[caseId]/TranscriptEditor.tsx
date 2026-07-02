"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TranscriptSegment } from "@/lib/types";
import type { EvidenceRow } from "@/lib/study/content";

type ItemOption = { id: string; section: string; text: string };

export default function TranscriptEditor({
  caseId,
  initialTranscript,
  initialEvidence,
  frozen,
  items,
}: {
  caseId: number;
  initialTranscript: TranscriptSegment[];
  initialEvidence: EvidenceRow[];
  frozen: boolean;
  items: ItemOption[];
}) {
  const router = useRouter();
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(initialTranscript);
  const [evidence, setEvidence] = useState<EvidenceRow[]>(initialEvidence);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ro = frozen; // read-only while frozen

  async function post(action: string, withContent: boolean) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/freeze-content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caseId,
        action,
        ...(withContent ? { content: { transcript, evidence } } : {}),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg(action === "save" ? "저장됨" : action === "freeze" ? "확정됨" : "확정 해제됨");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg("오류: " + (j.error ?? res.status));
    }
  }

  function updSeg(i: number, patch: Partial<TranscriptSegment>) {
    setTranscript((t) => t.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updEv(i: number, patch: Partial<EvidenceRow>) {
    setEvidence((e) => e.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 10,
            background: frozen ? "#dbeafe" : "#fef3c7",
            color: frozen ? "#1e40af" : "#92400e",
          }}
        >
          {frozen ? "확정됨 (Mode B 서빙 중)" : "미확정 (편집 가능, 서빙 안 됨)"}
        </span>
        {msg && <span style={{ fontSize: 13, color: "#374151" }}>{msg}</span>}
      </div>

      {/* Transcript */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>전사문 세그먼트</h2>
          {!ro && (
            <button
              onClick={() =>
                setTranscript((t) => [
                  ...t,
                  { id: `seg-${t.length + 1}`, start: 0, end: 0, text: "", timestamp: "" },
                ])
              }
              style={miniBtn}
            >
              + 세그먼트
            </button>
          )}
        </div>
        {transcript.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            아직 없음. Plan 4 파이프라인이 1차 자동 산출을 채웁니다.
          </p>
        )}
        {transcript.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <input
              type="number"
              value={s.start}
              disabled={ro}
              onChange={(e) => updSeg(i, { start: Number(e.target.value) })}
              style={{ ...inp, width: 70 }}
              title="start(s)"
            />
            <input
              type="number"
              value={s.end}
              disabled={ro}
              onChange={(e) => updSeg(i, { end: Number(e.target.value) })}
              style={{ ...inp, width: 70 }}
              title="end(s)"
            />
            <input
              value={s.text}
              disabled={ro}
              onChange={(e) => updSeg(i, { text: e.target.value })}
              style={{ ...inp, flex: 1 }}
              placeholder="발화 내용"
            />
            {!ro && (
              <button onClick={() => setTranscript((t) => t.filter((_, idx) => idx !== i))} style={delBtn}>
                ×
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Evidence */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>항목별 근거 발화 (Mode B)</h2>
          {!ro && (
            <button
              onClick={() => setEvidence((e) => [...e, { itemId: items[0]?.id ?? "", quote: "" }])}
              style={miniBtn}
            >
              + 근거
            </button>
          )}
        </div>
        {evidence.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <select
              value={r.itemId}
              disabled={ro}
              onChange={(e) => updEv(i, { itemId: e.target.value })}
              style={{ ...inp, width: 220 }}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  [{it.section}] {it.text.slice(0, 24)}
                </option>
              ))}
            </select>
            <input
              value={r.quote}
              disabled={ro}
              onChange={(e) => updEv(i, { quote: e.target.value })}
              style={{ ...inp, flex: 1 }}
              placeholder="근거 인용문"
            />
            <input
              type="number"
              value={r.ts ?? ""}
              disabled={ro}
              onChange={(e) => updEv(i, { ts: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={{ ...inp, width: 70 }}
              title="ts(s)"
            />
            {!ro && (
              <button onClick={() => setEvidence((e) => e.filter((_, idx) => idx !== i))} style={delBtn}>
                ×
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        {!frozen ? (
          <>
            <button disabled={busy} onClick={() => post("save", true)} style={actBtn("#111")}>
              저장
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm("확정하면 이 콘텐츠가 Mode B 평가자에게 서빙됩니다. 계속?")) post("freeze", true);
              }}
              style={actBtn("#166534")}
            >
              확정 (freeze)
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={() => post("unfreeze", false)} style={actBtn("#b45309")}>
            확정 해제 (재교정)
          </button>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 5,
  fontSize: 13,
};
const miniBtn: React.CSSProperties = {
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 5,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};
const delBtn: React.CSSProperties = {
  border: 0,
  background: "#fee2e2",
  color: "#b91c1c",
  borderRadius: 5,
  width: 26,
  height: 26,
  cursor: "pointer",
};
function actBtn(bg: string): React.CSSProperties {
  return { padding: "8px 16px", borderRadius: 6, background: bg, color: "#fff", border: 0, cursor: "pointer" };
}
