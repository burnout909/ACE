const DAY = 86_400_000;

export function isSession2Eligible(
  s1CompletedAt: number | null,
  now: number,
  washoutDays = 14
): boolean {
  if (s1CompletedAt == null) return false;
  return now - s1CompletedAt >= washoutDays * DAY;
}
