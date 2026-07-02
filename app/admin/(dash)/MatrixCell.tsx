"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  not_started: { bg: "#f3f4f6", fg: "#9ca3af", label: "·" },
  in_progress: { bg: "#fef3c7", fg: "#92400e", label: "◐" },
  submitted: { bg: "#dcfce7", fg: "#166534", label: "✓" },
  locked: { bg: "#dbeafe", fg: "#1e40af", label: "🔒" },
};

export type CellData = { mode: string; state: string; assignmentId: number };

export default function MatrixCell({ cell }: { cell?: CellData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const s = STATE_STYLE[cell?.state ?? "not_started"] ?? STATE_STYLE.not_started;
  const unlockable = cell?.state === "submitted";

  async function unlock() {
    if (!cell) return;
    const reason = prompt("잠금 해제 사유를 입력하세요 (감사로그에 기록됩니다):");
    if (reason == null || reason.trim() === "") return;
    setBusy(true);
    const res = await fetch("/api/admin/unlock-case", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId: cell.assignmentId, reason }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("해제 실패: " + res.status);
  }

  return (
    <td
      title={
        cell
          ? `${cell.mode} · ${cell.state}${unlockable ? " (클릭하여 해제)" : ""}`
          : ""
      }
      onClick={unlockable ? unlock : undefined}
      style={{
        background: s.bg,
        color: s.fg,
        textAlign: "center",
        fontSize: 11,
        padding: "2px 4px",
        border: "1px solid #fff",
        minWidth: 22,
        cursor: unlockable ? "pointer" : "default",
        opacity: busy ? 0.4 : 1,
      }}
    >
      {cell ? s.label : ""}
    </td>
  );
}
