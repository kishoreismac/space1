import type { CrossPatternAlert, DimensionScore } from '../types/index.js';

/**
 * Cross-pattern alerts per spec §5 (Phase 5 scoring).
 * The psych-safety alert is fired when Q7 average drops below 2.5 —
 * callers must pass that value separately because it's a sub-question, not a dimension.
 */
export function crossPatternAlerts(
  scoresByCode: Record<'S' | 'P' | 'A' | 'C' | 'E', DimensionScore>,
  psychSafetyAvg: number | null = null,
): CrossPatternAlert[] {
  const out: CrossPatternAlert[] = [];
  const s = scoresByCode.S.averageScore;
  const p = scoresByCode.P.averageScore;
  const a = scoresByCode.A.averageScore;
  const c = scoresByCode.C.averageScore;
  const e = scoresByCode.E.averageScore;

  if (s !== null && e !== null && s <= 2.9 && e <= 2.9) {
    out.push({
      code: 'TOOLING_HARM',
      severity: 'CRITICAL',
      message:
        'Low Satisfaction + Low Efficiency: tooling is actively harming the team. This is the highest AI-ROI signal.',
    });
  }
  if (a !== null && s !== null && a >= 3.5 && s <= 2.9) {
    out.push({
      code: 'HIDDEN_TOIL',
      severity: 'WARNING',
      message:
        'High Activity + Low Satisfaction: hidden toil. Velocity review will miss this — investigate what activity is being measured.',
    });
  }
  if (s !== null && p !== null && s <= 2.9 && p >= 3.0) {
    out.push({
      code: 'HEROICS_ATTRITION',
      severity: 'WARNING',
      message:
        'Low Satisfaction + Healthy Performance: heroics / attrition risk. Performance is being held up by unsustainable effort.',
    });
  }
  if (c !== null && p !== null && c <= 2.9 && p >= 3.0 && p <= 3.4) {
    out.push({
      code: 'COORDINATION_OVERHEAD',
      severity: 'WARNING',
      message:
        'Low Communication + Moderate Performance: coordination overhead is suppressing output.',
    });
  }
  if (psychSafetyAvg !== null && psychSafetyAvg < 2.5) {
    out.push({
      code: 'PSYCH_SAFETY_GATE',
      severity: 'CRITICAL',
      message:
        'Psychological safety below threshold: all other scores may be understated. Replace journey workshops with anonymous 1:1 interviews.',
    });
  }
  return out;
}
