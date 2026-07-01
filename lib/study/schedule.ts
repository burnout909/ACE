export type Mode = "A" | "B";
export type Assignment = {
  caseId: number;
  period: 1 | 2;
  mode: Mode;
  orderIndex: number;
};

// mulberry32: 작고 결정론적인 시드 PRNG
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildSchedule(caseIds: number[], seed: number): Assignment[] {
  const rand = rng(seed);
  const shuffled = shuffle(caseIds, rand);
  const half = Math.floor(shuffled.length / 2);
  const alpha = new Set(shuffled.slice(0, half));   // S1=A, S2=B
  // beta = 나머지                                    // S1=B, S2=A

  const modeFor = (caseId: number, period: 1 | 2): Mode => {
    const inAlpha = alpha.has(caseId);
    if (period === 1) return inAlpha ? "A" : "B";
    return inAlpha ? "B" : "A";
  };

  const out: Assignment[] = [];
  for (const period of [1, 2] as const) {
    // 세션 내 무작위 interleave. S2는 독립 재셔플(별도 시드 파생).
    const orderRand = period === 1 ? rand : rng(seed ^ 0x9e3779b9);
    const order = shuffle(caseIds, orderRand);
    order.forEach((caseId, orderIndex) => {
      out.push({ caseId, period, mode: modeFor(caseId, period), orderIndex });
    });
  }
  return out;
}
