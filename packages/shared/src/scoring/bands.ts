import type { Priority, ScoreBand } from '../types/index.js';

/**
 * Map an average score (1.0–5.0) to its band.
 * Bands per spec:
 *   1.0–2.0 Critical · 2.1–2.9 Significant · 3.0–3.4 Moderate · 3.5–4.2 Healthy · 4.3–5.0 Excellent
 */
export function scoreBand(avg: number | null): ScoreBand | null {
  if (avg === null || avg === undefined || !Number.isFinite(avg)) return null;
  if (avg <= 2.0) return 'CRITICAL';
  if (avg <= 2.9) return 'SIGNIFICANT';
  if (avg <= 3.4) return 'MODERATE';
  if (avg <= 4.2) return 'HEALTHY';
  return 'EXCELLENT';
}

export function bandToPriority(band: ScoreBand | null): Priority {
  switch (band) {
    case 'CRITICAL':
      return 'P1';
    case 'SIGNIFICANT':
      return 'P2';
    case 'MODERATE':
      return 'P3';
    case 'HEALTHY':
    case 'EXCELLENT':
    case null:
    default:
      return 'MONITOR';
  }
}

/**
 * Apply the trend-drop override: a decline of more than 0.4 vs previous cycle
 * promotes the dimension to P1 regardless of its absolute band.
 */
export function applyTrendOverride(
  currentBand: ScoreBand | null,
  currentAvg: number | null,
  previousAvg: number | null | undefined,
  threshold = 0.4,
): { priority: Priority; overridden: boolean } {
  const base = bandToPriority(currentBand);
  if (
    currentAvg === null ||
    previousAvg === null ||
    previousAvg === undefined ||
    !Number.isFinite(currentAvg) ||
    !Number.isFinite(previousAvg)
  ) {
    return { priority: base, overridden: false };
  }
  const drop = previousAvg - currentAvg;
  if (drop > threshold && base !== 'P1') {
    return { priority: 'P1', overridden: true };
  }
  return { priority: base, overridden: false };
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  CRITICAL: 'Critical',
  SIGNIFICANT: 'Significant friction',
  MODERATE: 'Moderate',
  HEALTHY: 'Healthy',
  EXCELLENT: 'Excellent',
};
