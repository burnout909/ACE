export type S1Row = { state: string; submitAt: Date | null };

/**
 * Session-1 completion timestamp for a rater, in epoch ms, or null if S1 is
 * not fully done. "Done" = every period-1 assignment is submitted or locked.
 * The timestamp is the latest submit_at across those assignments.
 */
export function s1CompletedAt(rows: S1Row[]): number | null {
  if (rows.length === 0) return null;
  let latest = 0;
  for (const r of rows) {
    if (r.state !== "submitted" && r.state !== "locked") return null;
    const t = r.submitAt ? r.submitAt.getTime() : 0;
    if (t > latest) latest = t;
  }
  return latest;
}
