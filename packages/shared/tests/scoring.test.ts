import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_WEIGHTS,
  SPACE_QUESTIONS,
  aiFeasibility,
  applyReverse,
  applyTrendOverride,
  bandToPriority,
  crossPatternAlerts,
  questionAverage,
  reverseScore,
  scoreBand,
  scoreCampaign,
  scoreSubmission,
} from '../src/index.js';
import type { DimensionScore, RawAnswer } from '../src/index.js';

describe('reverse scoring', () => {
  it('returns 6 - raw for valid values', () => {
    expect(reverseScore(1)).toBe(5);
    expect(reverseScore(2)).toBe(4);
    expect(reverseScore(3)).toBe(3);
    expect(reverseScore(4)).toBe(2);
    expect(reverseScore(5)).toBe(1);
  });
  it('returns null for invalid', () => {
    expect(reverseScore(null)).toBeNull();
    expect(reverseScore(undefined)).toBeNull();
    expect(reverseScore(0)).toBeNull();
    expect(reverseScore(6)).toBeNull();
    expect(reverseScore(NaN)).toBeNull();
  });
  it('applyReverse honors the flag', () => {
    expect(applyReverse(2, true)).toBe(4);
    expect(applyReverse(2, false)).toBe(2);
  });
});

describe('score bands', () => {
  it.each([
    [1.0, 'CRITICAL'],
    [2.0, 'CRITICAL'],
    [2.1, 'SIGNIFICANT'],
    [2.9, 'SIGNIFICANT'],
    [3.0, 'MODERATE'],
    [3.4, 'MODERATE'],
    [3.5, 'HEALTHY'],
    [4.2, 'HEALTHY'],
    [4.3, 'EXCELLENT'],
    [5.0, 'EXCELLENT'],
  ])('maps %s → %s', (avg, expected) => {
    expect(scoreBand(avg)).toBe(expected);
  });
  it('returns null for nullish', () => {
    expect(scoreBand(null)).toBeNull();
  });
  it('maps bands to priorities', () => {
    expect(bandToPriority('CRITICAL')).toBe('P1');
    expect(bandToPriority('SIGNIFICANT')).toBe('P2');
    expect(bandToPriority('MODERATE')).toBe('P3');
    expect(bandToPriority('HEALTHY')).toBe('MONITOR');
    expect(bandToPriority('EXCELLENT')).toBe('MONITOR');
  });
});

describe('trend override', () => {
  it('promotes to P1 when drop > 0.4', () => {
    const r = applyTrendOverride('HEALTHY', 3.8, 4.3);
    expect(r.priority).toBe('P1');
    expect(r.overridden).toBe(true);
  });
  it('does not override when drop ≤ 0.4', () => {
    const r = applyTrendOverride('HEALTHY', 3.9, 4.3);
    expect(r.priority).toBe('MONITOR');
    expect(r.overridden).toBe(false);
  });
  it('does not override when already P1', () => {
    const r = applyTrendOverride('CRITICAL', 1.8, 3.0);
    expect(r.priority).toBe('P1');
    expect(r.overridden).toBe(false);
  });
});

describe('scoreSubmission', () => {
  it('computes per-dimension averages with reverse applied', () => {
    // Pick a tiny subset of the canonical questionnaire to keep the test focused.
    const qs = SPACE_QUESTIONS.filter((q) => q.dimensionCode === 'S' && q.type === 'LIKERT');
    // S has Q1,2,4,5,6,7 normal and Q3 reverse. 7 Likert questions in S.
    const answers: RawAnswer[] = qs.map((q) => ({
      questionNumber: q.number,
      rawValue: 4,
    }));
    const result = scoreSubmission(SPACE_QUESTIONS, answers);
    const s = result.find((r) => r.code === 'S')!;
    // 6 normal answers scored 4; 1 reverse scored 2. avg = (6*4 + 1*2)/7 = 26/7 ≈ 3.71
    expect(s.averageScore).toBeCloseTo(3.71, 1);
    expect(s.band).toBe('HEALTHY');
    expect(s.responseCount).toBe(7);
  });

  it('handles missing answers without crashing', () => {
    const r = scoreSubmission(SPACE_QUESTIONS, []);
    expect(r.every((d) => d.averageScore === null)).toBe(true);
    expect(r.every((d) => d.priority === 'MONITOR')).toBe(true);
  });
});

describe('scoreCampaign', () => {
  it('averages across many submissions', () => {
    const allAnswers: RawAnswer[][] = [
      SPACE_QUESTIONS.filter((q) => q.type === 'LIKERT').map((q) => ({
        questionNumber: q.number,
        rawValue: 5,
      })),
      SPACE_QUESTIONS.filter((q) => q.type === 'LIKERT').map((q) => ({
        questionNumber: q.number,
        rawValue: 1,
      })),
    ];
    const result = scoreCampaign(SPACE_QUESTIONS, allAnswers);
    // Each dim should average ~3 (because reverse questions flip 5↔1 and 1↔5, so still mean 3)
    for (const d of result) {
      expect(d.averageScore).toBeCloseTo(3.0, 1);
      expect(d.band).toBe('MODERATE');
    }
  });
});

describe('questionAverage', () => {
  it('respects reverse flag', () => {
    const q = SPACE_QUESTIONS.find((x) => x.number === 3)!; // reverse
    const r = questionAverage(q, [
      [{ questionNumber: 3, rawValue: 1 }],
      [{ questionNumber: 3, rawValue: 1 }],
    ]);
    expect(r.average).toBe(5); // 6-1
    expect(r.responseCount).toBe(2);
  });
});

describe('cross-pattern alerts', () => {
  const make = (s: number, p: number, a: number, c: number, e: number): Record<'S'|'P'|'A'|'C'|'E', DimensionScore> => ({
    S: { code: 'S', name: 'S', averageScore: s, responseCount: 1, band: scoreBand(s), priority: bandToPriority(scoreBand(s)) },
    P: { code: 'P', name: 'P', averageScore: p, responseCount: 1, band: scoreBand(p), priority: bandToPriority(scoreBand(p)) },
    A: { code: 'A', name: 'A', averageScore: a, responseCount: 1, band: scoreBand(a), priority: bandToPriority(scoreBand(a)) },
    C: { code: 'C', name: 'C', averageScore: c, responseCount: 1, band: scoreBand(c), priority: bandToPriority(scoreBand(c)) },
    E: { code: 'E', name: 'E', averageScore: e, responseCount: 1, band: scoreBand(e), priority: bandToPriority(scoreBand(e)) },
  });

  it('fires tooling-harm when S and E both ≤ 2.9', () => {
    const alerts = crossPatternAlerts(make(2.4, 3.1, 3.8, 2.6, 2.2));
    expect(alerts.find((a) => a.code === 'S-E-01')).toBeTruthy();
  });
  it('fires hidden-toil when A ≥ 3.5 and S ≤ 2.9', () => {
    const alerts = crossPatternAlerts(make(2.4, 3.1, 3.8, 3.5, 3.5));
    expect(alerts.find((a) => a.code === 'S-A-01')).toBeTruthy();
  });
  it('fires heroics when S ≤ 2.9 and P ≥ 3.0', () => {
    const alerts = crossPatternAlerts(make(2.4, 3.8, 3.0, 3.5, 2.6));
    expect(alerts.find((a) => a.code === 'M-02')).toBeTruthy();
  });
  it('fires coordination-overhead when C ≤ 2.9 and 3.0 ≤ P ≤ 3.4', () => {
    const alerts = crossPatternAlerts(make(3.5, 3.2, 3.8, 2.6, 3.5));
    expect(alerts.find((a) => a.code === 'M-07')).toBeTruthy();
  });
  it('fires psych-safety gate when Q7 avg < 2.5', () => {
    const alerts = crossPatternAlerts(make(3.5, 3.5, 3.5, 3.5, 3.5), 2.3);
    expect(alerts.find((a) => a.code === 'PSYCH_SAFETY_GATE')).toBeTruthy();
  });
  it('no alerts when all healthy', () => {
    const alerts = crossPatternAlerts(make(4.0, 4.0, 4.0, 4.0, 4.0), 4.0);
    expect(alerts.find((a) => a.code === 'M-13')).toBeTruthy();
  });
  it('treats 3.0 as low for cross-pattern detection', () => {
    const alerts = crossPatternAlerts(make(3.0, 3.0, 3.2, 3.2, 3.2));
    expect(alerts.find((a) => a.code === 'S-P-01')).toBeTruthy();
  });
  it('treats 3.5 as high for cross-pattern detection', () => {
    const alerts = crossPatternAlerts(make(3.0, 3.5, 3.5, 3.5, 3.5));
    expect(alerts.find((a) => a.code === 'P-S-01')).toBeTruthy();
  });
  it('treats scores between 3.0 and 3.5 as moderate where rules allow moderate performance', () => {
    const alerts = crossPatternAlerts(make(2.8, 3.2, 3.5, 3.5, 3.5));
    expect(alerts.find((a) => a.code === 'M-06')).toBeTruthy();
  });
  it('does not return reciprocal duplicate pair patterns', () => {
    const alerts = crossPatternAlerts(make(2.8, 3.2, 3.2, 2.8, 3.2));
    expect(alerts.find((a) => a.code === 'S-C-01')).toBeTruthy();
    expect(alerts.find((a) => a.code === 'C-S-01')).toBeFalsy();
  });
});

describe('AI feasibility', () => {
  it('matches the Land O\'Lakes worked example (codebase onboarding)', () => {
    // From XLSX worked example: TM 5, IE 4, CE 5, DA 4, DevAdopt 5 → 4.65 (weights 25/20/25/15/15)
    const r = aiFeasibility(
      { toolMaturity: 5, integrationEase: 4, costEfficiency: 5, dataAvailability: 4, developerAdoption: 5 },
      DEFAULT_AI_WEIGHTS,
    );
    expect(r.weightedScore).toBeCloseTo(4.65, 2);
  });

  it('classifies Quick Win when composite ≥ 4 AND high severity', () => {
    const r = aiFeasibility(
      { toolMaturity: 5, integrationEase: 5, costEfficiency: 5, dataAvailability: 5, developerAdoption: 5 },
      DEFAULT_AI_WEIGHTS,
      { highSeverity: true },
    );
    expect(r.weightedScore).toBe(5);
    expect(r.classification).toBe('QUICK_WIN');
  });
  it('classifies Strategic Bet when ≥ 3.5 AND strategic/high reach', () => {
    const r = aiFeasibility(
      { toolMaturity: 4, integrationEase: 4, costEfficiency: 4, dataAvailability: 3, developerAdoption: 3 },
      DEFAULT_AI_WEIGHTS,
      { strategicOrHighReach: true },
    );
    expect(r.classification).toBe('STRATEGIC_BET');
  });
  it('classifies Monitor in 2.5–3.4 range', () => {
    const r = aiFeasibility(
      { toolMaturity: 3, integrationEase: 3, costEfficiency: 3, dataAvailability: 3, developerAdoption: 3 },
    );
    expect(r.classification).toBe('MONITOR');
  });
  it('classifies Defer below 2.5', () => {
    const r = aiFeasibility(
      { toolMaturity: 2, integrationEase: 2, costEfficiency: 2, dataAvailability: 2, developerAdoption: 2 },
    );
    expect(r.classification).toBe('DEFER');
  });
  it('throws if weights do not sum to 1.0', () => {
    expect(() =>
      aiFeasibility(
        { toolMaturity: 3, integrationEase: 3, costEfficiency: 3, dataAvailability: 3, developerAdoption: 3 },
        { toolMaturity: 0.5, integrationEase: 0.5, costEfficiency: 0.5, dataAvailability: 0.5, developerAdoption: 0.5 },
      ),
    ).toThrow(/sum to 1/);
  });
});

describe('canonical questionnaire shape', () => {
  it('has 50 main questions plus one overall SDLC blocker question', () => {
    expect(SPACE_QUESTIONS).toHaveLength(51);
    expect(SPACE_QUESTIONS.at(-1)?.number).toBe(51);
    expect(SPACE_QUESTIONS.at(-1)?.type).toBe('OPEN_TEXT');
  });
  it('has 10 questions per dimension', () => {
    for (const code of ['S', 'P', 'A', 'C', 'E'] as const) {
      const main = SPACE_QUESTIONS.filter((q) => q.dimensionCode === code && q.number <= 50);
      expect(main).toHaveLength(10);
      expect(main.filter((q) => q.type === 'LIKERT')).toHaveLength(7);
      expect(main.filter((q) => q.type === 'OPEN_TEXT')).toHaveLength(3);
    }
  });
  it('has 13 reverse-scored questions', () => {
    expect(SPACE_QUESTIONS.filter((q) => q.isReverseScored)).toHaveLength(13);
  });
  it('has 3 open-text questions per dimension plus Q51', () => {
    const open = SPACE_QUESTIONS.filter((q) => q.type === 'OPEN_TEXT').map((q) => q.number);
    expect(open).toEqual([8, 9, 10, 18, 19, 20, 28, 29, 30, 38, 39, 40, 48, 49, 50, 51]);
  });
});
