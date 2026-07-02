import { describe, it, expect } from "vitest";
import { activeMs } from "@/lib/study/activeTime";

describe("activeMs", () => {
  it("sums gaps but excludes idle stretches over threshold", () => {
    const ev = [0, 5_000, 10_000, 200_000, 205_000].map((t) => ({ serverTs: t }));
    // 10s active + [200s 간격 idle 제외] + 5s active = 15_000
    expect(activeMs(ev, 60_000)).toBe(15_000);
  });
  it("returns 0 for fewer than 2 events", () => {
    expect(activeMs([{ serverTs: 1 }])).toBe(0);
  });
});
