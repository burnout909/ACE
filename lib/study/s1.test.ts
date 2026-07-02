import { describe, it, expect } from "vitest";
import { s1CompletedAt } from "@/lib/study/s1";

describe("s1CompletedAt", () => {
  it("null when any case is unfinished", () => {
    expect(
      s1CompletedAt([
        { state: "submitted", submitAt: new Date(1000) },
        { state: "in_progress", submitAt: null },
      ])
    ).toBeNull();
  });

  it("null on empty input", () => {
    expect(s1CompletedAt([])).toBeNull();
  });

  it("latest submit_at when all submitted/locked", () => {
    expect(
      s1CompletedAt([
        { state: "submitted", submitAt: new Date(1000) },
        { state: "locked", submitAt: new Date(5000) },
        { state: "submitted", submitAt: new Date(3000) },
      ])
    ).toBe(5000);
  });
});
