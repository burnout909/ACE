import { describe, it, expect } from "vitest";
import { buildSchedule } from "@/lib/study/schedule";

const CASES = Array.from({ length: 30 }, (_, i) => i + 1);

describe("buildSchedule", () => {
  it("is deterministic for a given seed and covers 30 cases × 2 periods", () => {
    const a = buildSchedule(CASES, 12345);
    const b = buildSchedule(CASES, 12345);
    expect(a).toEqual(b);
    expect(a).toHaveLength(60);
    expect(buildSchedule(CASES, 999)).not.toEqual(a); // 다른 시드 → 다른 배정
  });

  it("each case appears once per period with opposite modes (fully paired)", () => {
    const s = buildSchedule(CASES, 7);
    for (const caseId of CASES) {
      const rows = s.filter((r) => r.caseId === caseId);
      expect(rows).toHaveLength(2);
      const modes = rows.map((r) => r.mode).sort();
      expect(modes).toEqual(["A", "B"]); // 두 세션에서 서로 다른 모드
    }
  });

  it("splits 30 cases into 15 A / 15 B in session 1", () => {
    const s1 = buildSchedule(CASES, 7).filter((r) => r.period === 1);
    expect(s1.filter((r) => r.mode === "A")).toHaveLength(15);
    expect(s1.filter((r) => r.mode === "B")).toHaveLength(15);
  });

  it("session 2 order is an independent reshuffle of session 1 order", () => {
    const s = buildSchedule(CASES, 7);
    const order1 = s.filter((r) => r.period === 1).sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.caseId);
    const order2 = s.filter((r) => r.period === 2).sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.caseId);
    expect(order2).not.toEqual(order1);           // 순서 재셔플됨
    expect([...order2].sort()).toEqual([...order1].sort()); // 같은 30 케이스 집합
  });
});
