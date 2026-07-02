import { describe, it, expect } from "vitest";
import { buildMatrix } from "@/lib/study/matrix";

describe("buildMatrix", () => {
  it("groups by rater with case:period cells", () => {
    const m = buildMatrix([
      { raterId: "P1", caseId: 3, period: 1, mode: "A", state: "submitted" },
      { raterId: "P1", caseId: 3, period: 2, mode: "B", state: "not_started" },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].cells["3:1"]).toEqual({ mode: "A", state: "submitted" });
    expect(m[0].cells["3:2"]).toEqual({ mode: "B", state: "not_started" });
  });

  it("keeps raters separate and stable in first-seen order", () => {
    const m = buildMatrix([
      { raterId: "P2", caseId: 1, period: 1, mode: "B", state: "in_progress" },
      { raterId: "P1", caseId: 1, period: 1, mode: "A", state: "submitted" },
      { raterId: "P2", caseId: 5, period: 1, mode: "A", state: "not_started" },
    ]);
    expect(m.map((r) => r.raterId)).toEqual(["P2", "P1"]);
    expect(m[0].cells["1:1"]).toEqual({ mode: "B", state: "in_progress" });
    expect(m[0].cells["5:1"]).toEqual({ mode: "A", state: "not_started" });
    expect(m[1].cells["1:1"]).toEqual({ mode: "A", state: "submitted" });
  });
});
