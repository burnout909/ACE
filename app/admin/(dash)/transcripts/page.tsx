import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function TranscriptsIndex() {
  const [cases, contents] = await Promise.all([
    prisma.case.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.caseContent.findMany({ select: { caseId: true, frozen: true } }),
  ]);
  const frozenBy = new Map(contents.map((c) => [c.caseId, c.frozen]));

  return (
    <div>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>전사문 교정</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        각 케이스의 전사문·근거를 교정 후 확정하면 Mode B 평가자에게 서빙됩니다. 확정 전엔 서빙되지 않습니다.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, maxWidth: 720 }}>
        {cases.map((c) => {
          const state = frozenBy.get(c.id);
          const label = state === true ? "확정" : frozenBy.has(c.id) ? "미확정" : "없음";
          const color = state === true ? "#166534" : frozenBy.has(c.id) ? "#b45309" : "#9ca3af";
          return (
            <Link
              key={c.id}
              href={`/admin/transcripts/${c.id}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "8px 10px",
                textDecoration: "none",
                color: "#111",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <span>케이스 {c.id}</span>
              <span style={{ color, fontSize: 12 }}>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
