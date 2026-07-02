export type MatrixRow = {
  raterId: string;
  caseId: number;
  period: 1 | 2;
  mode: "A" | "B";
  state: string;
};

export type MatrixCell = { mode: string; state: string };

/**
 * Collapse flat assignment×progress rows into one entry per rater whose
 * `cells` map is keyed "caseId:period". Rater order follows first appearance.
 */
export function buildMatrix(
  rows: MatrixRow[]
): { raterId: string; cells: Record<string, MatrixCell> }[] {
  const byRater = new Map<string, Record<string, MatrixCell>>();
  for (const r of rows) {
    const cells = byRater.get(r.raterId) ?? {};
    cells[`${r.caseId}:${r.period}`] = { mode: r.mode, state: r.state };
    byRater.set(r.raterId, cells);
  }
  return [...byRater].map(([raterId, cells]) => ({ raterId, cells }));
}
