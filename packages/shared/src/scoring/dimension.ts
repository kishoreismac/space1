import type {
  DimensionCode,
  DimensionScore,
  QuestionDef,
  RawAnswer,
} from '../types/index.js';
import { applyReverse } from './reverse.js';
import { bandToPriority, scoreBand } from './bands.js';

const DIMENSION_NAMES: Record<DimensionCode, string> = {
  S: 'Satisfaction',
  P: 'Performance',
  A: 'Activity',
  C: 'Communication',
  E: 'Efficiency',
};

/** Score one submission across all five dimensions. */
export function scoreSubmission(
  questions: QuestionDef[],
  answers: RawAnswer[],
): DimensionScore[] {
  const answerByQ = new Map<number, RawAnswer>(
    answers.map((a) => [a.questionNumber, a]),
  );
  const buckets: Record<DimensionCode, number[]> = {
    S: [],
    P: [],
    A: [],
    C: [],
    E: [],
  };

  for (const q of questions) {
    if (q.type !== 'LIKERT') continue;
    const a = answerByQ.get(q.number);
    const scored = applyReverse(a?.rawValue ?? null, q.isReverseScored);
    if (scored !== null) buckets[q.dimensionCode].push(scored);
  }

  return (Object.keys(buckets) as DimensionCode[]).map((code) => {
    const vals = buckets[code];
    const avg = vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      : null;
    const band = scoreBand(avg);
    return {
      code,
      name: DIMENSION_NAMES[code],
      averageScore: avg,
      responseCount: vals.length,
      band,
      priority: bandToPriority(band),
    };
  });
}

/** Aggregate dimension scores across many submissions for a campaign. */
export function scoreCampaign(
  questions: QuestionDef[],
  submissionsAnswers: RawAnswer[][],
): DimensionScore[] {
  const buckets: Record<DimensionCode, number[]> = {
    S: [],
    P: [],
    A: [],
    C: [],
    E: [],
  };
  for (const answers of submissionsAnswers) {
    const answerByQ = new Map<number, RawAnswer>(
      answers.map((a) => [a.questionNumber, a]),
    );
    for (const q of questions) {
      if (q.type !== 'LIKERT') continue;
      const a = answerByQ.get(q.number);
      const scored = applyReverse(a?.rawValue ?? null, q.isReverseScored);
      if (scored !== null) buckets[q.dimensionCode].push(scored);
    }
  }
  return (Object.keys(buckets) as DimensionCode[]).map((code) => {
    const vals = buckets[code];
    const avg = vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      : null;
    const band = scoreBand(avg);
    return {
      code,
      name: DIMENSION_NAMES[code],
      averageScore: avg,
      responseCount: vals.length,
      band,
      priority: bandToPriority(band),
    };
  });
}

/** Average a single question across submissions (for the question-level report). */
export function questionAverage(
  question: QuestionDef,
  submissionsAnswers: RawAnswer[][],
): { average: number | null; responseCount: number } {
  if (question.type !== 'LIKERT') return { average: null, responseCount: 0 };
  const values: number[] = [];
  for (const answers of submissionsAnswers) {
    const a = answers.find((x) => x.questionNumber === question.number);
    const scored = applyReverse(a?.rawValue ?? null, question.isReverseScored);
    if (scored !== null) values.push(scored);
  }
  if (!values.length) return { average: null, responseCount: 0 };
  return {
    average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    responseCount: values.length,
  };
}
