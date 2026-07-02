import { describe, it, expect } from "vitest";
import { needsCorrection, clampSeek } from "@/lib/sync";

describe("needsCorrection", () => {
  it("false when within threshold", () => {
    expect(needsCorrection(10.0, 10.1)).toBe(false);
  });
  it("true when drift exceeds threshold (either direction)", () => {
    expect(needsCorrection(10.0, 10.3)).toBe(true);
    expect(needsCorrection(10.0, 9.7)).toBe(true);
  });
  it("respects a custom threshold", () => {
    expect(needsCorrection(10.0, 10.4, 0.5)).toBe(false);
    expect(needsCorrection(10.0, 10.6, 0.5)).toBe(true);
  });
});

describe("clampSeek", () => {
  it("clamps to [0, duration]", () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(150, 100)).toBe(100);
    expect(clampSeek(42, 100)).toBe(42);
  });
});
