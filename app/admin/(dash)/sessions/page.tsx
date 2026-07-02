import { prisma } from "@/lib/db/client";
import { s1CompletedAt } from "@/lib/study/s1";
import { isSession2Eligible } from "@/lib/study/eligibility";
import SessionsTable, { type SessionRow } from "./SessionsTable";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const now = Date.now();

  const [raters, s1progress, s2sessions] = await Promise.all([
    prisma.rater.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.caseProgress.findMany({
      where: { assignment: { period: 1 } },
      select: { state: true, submitAt: true, assignment: { select: { raterId: true } } },
    }),
    prisma.session.findMany({
      where: { period: 2 },
      select: { raterId: true, status: true, windowOpenAt: true, windowCloseAt: true },
    }),
  ]);

  const s1ByRater = new Map<string, { state: string; submitAt: Date | null }[]>();
  for (const p of s1progress) {
    const arr = s1ByRater.get(p.assignment.raterId) ?? [];
    arr.push({ state: p.state, submitAt: p.submitAt });
    s1ByRater.set(p.assignment.raterId, arr);
  }
  const s2ByRater = new Map(s2sessions.map((s) => [s.raterId, s]));

  const rows: SessionRow[] = raters.map((r) => {
    const doneAt = s1CompletedAt(s1ByRater.get(r.id) ?? []);
    const s2 = s2ByRater.get(r.id);
    const windowOpen =
      !!s2 &&
      s2.status === "active" &&
      (!s2.windowOpenAt || s2.windowOpenAt.getTime() <= now) &&
      (!s2.windowCloseAt || now < s2.windowCloseAt.getTime());
    return {
      raterId: r.id,
      name: r.name,
      s1CompletedAt: doneAt,
      eligible: isSession2Eligible(doneAt, now),
      s2Status: s2?.status ?? "locked",
      windowOpen,
    };
  });

  return (
    <div>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Session 2 승인</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        S1 전 케이스 제출 + 워시아웃(14일) 경과 시 자격 충족. 승인하면 S2 세션이 활성화되고 윈도가 열립니다.
        미충족 rater 승인은 강제 확인 후 감사로그에 기록됩니다.
      </p>
      <SessionsTable rows={rows} />
    </div>
  );
}
