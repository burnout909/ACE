import { prisma } from "@/lib/db/client";
import { buildMatrix, type MatrixRow } from "@/lib/study/matrix";

export const dynamic = "force-dynamic";

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  not_started: { bg: "#f3f4f6", fg: "#9ca3af", label: "·" },
  in_progress: { bg: "#fef3c7", fg: "#92400e", label: "◐" },
  submitted: { bg: "#dcfce7", fg: "#166534", label: "✓" },
  locked: { bg: "#dbeafe", fg: "#1e40af", label: "🔒" },
};

function Cell({ cell }: { cell?: { mode: string; state: string } }) {
  const s = STATE_STYLE[cell?.state ?? "not_started"] ?? STATE_STYLE.not_started;
  return (
    <td
      title={cell ? `${cell.mode} · ${cell.state}` : ""}
      style={{
        background: s.bg,
        color: s.fg,
        textAlign: "center",
        fontSize: 11,
        padding: "2px 4px",
        border: "1px solid #fff",
        minWidth: 22,
      }}
    >
      {cell ? s.label : ""}
    </td>
  );
}

export default async function MatrixPage() {
  const [assignments, raters] = await Promise.all([
    prisma.assignment.findMany({
      select: {
        raterId: true,
        caseId: true,
        period: true,
        mode: true,
        progress: { select: { state: true } },
      },
    }),
    prisma.rater.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);

  const rows: MatrixRow[] = assignments.map((a) => ({
    raterId: a.raterId,
    caseId: a.caseId,
    period: a.period as 1 | 2,
    mode: a.mode,
    state: a.progress?.state ?? "not_started",
  }));

  const matrix = buildMatrix(rows);
  const byRater = new Map(matrix.map((m) => [m.raterId, m.cells]));
  const nameOf = new Map(raters.map((r) => [r.id, r.name]));

  const caseIds = [...new Set(rows.map((r) => r.caseId))].sort((a, b) => a - b);
  const orderedRaters = raters.map((r) => r.id).filter((id) => byRater.has(id));

  function completion(raterId: string, period: 1 | 2) {
    const cells = byRater.get(raterId) ?? {};
    const mine = caseIds.map((c) => cells[`${c}:${period}`]).filter(Boolean);
    const done = mine.filter((c) => c!.state === "submitted" || c!.state === "locked").length;
    return `${done}/${mine.length}`;
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>진행 매트릭스</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        · 미시작 &nbsp; ◐ 진행중 &nbsp; ✓ 제출 &nbsp; 🔒 잠금 &nbsp;— 셀 호버 시 모드/상태 표시
      </p>

      {([1, 2] as const).map((period) => (
        <section key={period} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Session {period}</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "#fff", textAlign: "left", padding: "2px 8px" }}>
                    평가자
                  </th>
                  {caseIds.map((c) => (
                    <th key={c} style={{ padding: "2px 4px", color: "#6b7280", fontWeight: 400 }}>
                      {c}
                    </th>
                  ))}
                  <th style={{ padding: "2px 8px", color: "#374151" }}>완료</th>
                </tr>
              </thead>
              <tbody>
                {orderedRaters.map((rid) => {
                  const cells = byRater.get(rid) ?? {};
                  return (
                    <tr key={rid}>
                      <td style={{ position: "sticky", left: 0, background: "#fff", padding: "2px 8px", whiteSpace: "nowrap" }}>
                        {nameOf.get(rid) ?? rid} <span style={{ color: "#9ca3af" }}>({rid})</span>
                      </td>
                      {caseIds.map((c) => (
                        <Cell key={c} cell={cells[`${c}:${period}`]} />
                      ))}
                      <td style={{ padding: "2px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {completion(rid, period)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
