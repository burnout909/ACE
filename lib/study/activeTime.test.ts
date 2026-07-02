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

  // ── New cases added by Plan-2 fix wave ────────────────────────────────────

  it("heartbeats do not mask idle gaps", () => {
    // Real events at 0 and 300_000 ms, 9 heartbeats in between at 30s intervals.
    // After filtering heartbeats: one 300s gap, video not playing, >idle → excluded.
    const events = [
      { serverTs: 0, type: "item_decide" },
      { serverTs: 30_000, type: "heartbeat" },
      { serverTs: 60_000, type: "heartbeat" },
      { serverTs: 90_000, type: "heartbeat" },
      { serverTs: 120_000, type: "heartbeat" },
      { serverTs: 150_000, type: "heartbeat" },
      { serverTs: 180_000, type: "heartbeat" },
      { serverTs: 210_000, type: "heartbeat" },
      { serverTs: 240_000, type: "heartbeat" },
      { serverTs: 270_000, type: "heartbeat" },
      { serverTs: 300_000, type: "item_decide" },
    ];
    expect(activeMs(events, 60_000)).toBe(0);
  });

  it("video playback counts as active even beyond idle threshold", () => {
    // play at 0 → pause at 300_000: entire 300s gap is playing → counted.
    const events = [
      { serverTs: 0, type: "play" },
      { serverTs: 300_000, type: "pause" },
    ];
    expect(activeMs(events, 60_000)).toBe(300_000);
  });

  it("paused idle gap excluded, short playing gap counted", () => {
    // play→pause: 10s playing → counted.
    // pause→item_focus: 190s not playing, >idle → excluded.
    const events = [
      { serverTs: 0, type: "play" },
      { serverTs: 10_000, type: "pause" },
      { serverTs: 200_000, type: "item_focus" },
    ];
    expect(activeMs(events, 60_000)).toBe(10_000);
  });
});
