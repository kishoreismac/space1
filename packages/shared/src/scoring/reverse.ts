/**
 * Reverse-score a raw Likert 1–5 value.
 * Formula: scored = 6 − raw.
 * Returns null when the raw value is null/undefined or out of range.
 */
export function reverseScore(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw)) return null;
  if (raw < 1 || raw > 5) return null;
  return 6 - raw;
}

/** Apply reverse scoring conditionally. */
export function applyReverse(
  raw: number | null | undefined,
  isReverse: boolean,
): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (raw < 1 || raw > 5) return null;
  return isReverse ? 6 - raw : raw;
}
