// Pure sync-decision logic for the 3-view lockstep player. Kept side-effect
// free so it can be unit-tested; the React hook applies these decisions to
// real <video> elements.

const DEFAULT_DRIFT = 0.15; // seconds a slave may lag/lead the master before correction

/** True when a slave view has drifted from the master beyond the threshold. */
export function needsCorrection(
  masterTime: number,
  slaveTime: number,
  threshold: number = DEFAULT_DRIFT
): boolean {
  return Math.abs(masterTime - slaveTime) > threshold;
}

/** Clamp a seek target into the valid [0, duration] range. */
export function clampSeek(time: number, duration: number): number {
  if (time < 0) return 0;
  if (time > duration) return duration;
  return time;
}
