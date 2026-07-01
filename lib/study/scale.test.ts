import { describe, it, expect } from "vitest";
import { isValidAnswer, allowedValues } from "@/lib/study/scale";

describe("scale validation", () => {
  it("binary allows only 0 or 1", () => {
    expect(isValidAnswer("binary", 0)).toBe(true);
    expect(isValidAnswer("binary", 1)).toBe(true);
    expect(isValidAnswer("binary", 2)).toBe(false);
    expect(allowedValues("binary")).toEqual([0, 1]);
  });
  it("triple allows 1,2,3 (미흡/보통/우수), not 0", () => {
    expect(isValidAnswer("triple", 1)).toBe(true);
    expect(isValidAnswer("triple", 3)).toBe(true);
    expect(isValidAnswer("triple", 0)).toBe(false);
    expect(allowedValues("triple")).toEqual([1, 2, 3]);
  });
});
