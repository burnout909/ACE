import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/lib/auth/token";

const SECRET = "test-secret-please-change";

describe("session token", () => {
  it("round-trips rater and period", () => {
    const t = signToken("P2", 1, SECRET);
    expect(verifyToken(t, SECRET)).toEqual({ raterId: "P2", period: 1 });
  });
  it("rejects tampered payload", () => {
    const t = signToken("P2", 1, SECRET);
    const tampered = t.replace("P2", "P3");
    expect(verifyToken(tampered, SECRET)).toBeNull();
  });
  it("rejects wrong secret", () => {
    const t = signToken("P2", 1, SECRET);
    expect(verifyToken(t, "other-secret")).toBeNull();
  });
});
