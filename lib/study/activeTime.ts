export function activeMs(events: { serverTs: number }[], idleMs = 60_000): number {
  const ts = events.map((e) => e.serverTs).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap <= idleMs) total += gap;
  }
  return total;
}
