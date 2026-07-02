export type ActiveEvent = { serverTs: number; type?: string };

/**
 * Compute active milliseconds from an ordered event stream.
 *
 * A gap between two consecutive (non-heartbeat) events counts as active if:
 *   (a) the video was PLAYING at the start of the gap (from the last play/pause
 *       event seen before it), OR
 *   (b) the gap is ≤ idleMs (user was recently interacting).
 *
 * `heartbeat` events are excluded from the walk so they cannot mask genuine
 * idle periods — heartbeats are liveness signals, not interaction evidence.
 *
 * Backward-compatible with callers that pass `{ serverTs: number }[]` (no
 * `type` field) — events without a type are treated as generic interaction
 * events (they don't change the playing state).
 */
export function activeMs(events: ActiveEvent[], idleMs = 60_000): number {
  const sorted = events
    .filter((e) => e.type !== "heartbeat")
    .slice()
    .sort((a, b) => a.serverTs - b.serverTs);
  let total = 0;
  let playing = false;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (prev.type === "play") playing = true;
    else if (prev.type === "pause") playing = false;
    const gap = sorted[i].serverTs - prev.serverTs;
    if (playing || gap <= idleMs) total += gap;
  }
  return total;
}
