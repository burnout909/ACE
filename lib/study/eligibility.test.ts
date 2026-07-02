import { describe, it, expect } from "vitest";
import { isSession2Eligible } from "@/lib/study/eligibility";

const DAY = 86_400_000;

describe("isSession2Eligible", () => {
  it("false until session 1 complete", () =>
    expect(isSession2Eligible(null, 0)).toBe(false));
  it("false before washout, true after", () => {
    const done = 1_000_000_000;
    expect(isSession2Eligible(done, done + 13 * DAY, 14)).toBe(false);
    expect(isSession2Eligible(done, done + 15 * DAY, 14)).toBe(true);
  });
});
