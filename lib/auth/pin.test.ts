import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, isLockedOut } from "@/lib/auth/pin";

describe("pin", () => {
  it("verifies a correct pin and rejects a wrong one", () => {
    const salt = "rater-P2-salt";
    const h = hashPin("482913", salt);
    expect(verifyPin("482913", salt, h)).toBe(true);
    expect(verifyPin("000000", salt, h)).toBe(false);
  });
  it("locks out after 5 attempts within 10 minutes", () => {
    const now = 10_000_000;
    const recent = Array.from({ length: 5 }, (_, i) => ({ at: now - i * 60_000 }));
    expect(isLockedOut(recent, now)).toBe(true);
    const old = Array.from({ length: 5 }, (_, i) => ({ at: now - (11 * 60_000) - i }));
    expect(isLockedOut(old, now)).toBe(false);
  });
});
