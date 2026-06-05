import { Router } from 'express';
import {
  SPACE_QUESTIONS,
  scoreCampaign,
  scoreSubmission,
  crossPatternAlerts,
  scoreBand,
  bandToPriority,
  type RawAnswer,
  type DimensionScore,
} from '@space/shared';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.js';

/**
 * Phase 0 endpoint: stateless scoring service.
 * Lets you POST raw answers and get the full scored profile back without
 * needing a campaign/submission yet. Used as a smoke test for the shared engine
 * and also serves the participant "show me my individual score" optional view.
 */
export const scoringRouter = Router();

const RawAnswerSchema = z.object({
  questionNumber: z.number().int().min(1).max(51),
  rawValue: z.number().int().min(1).max(5).nullable(),
  textValue: z.string().nullable().optional(),
});

const SubmissionSchema = z.object({
  answers: z.array(RawAnswerSchema),
});

const CampaignSchema = z.object({
  submissions: z.array(z.array(RawAnswerSchema)),
  psychSafetyQuestionNumber: z.number().int().optional().default(7),
});

scoringRouter.post('/score-submission', (req, res) => {
  const parsed = SubmissionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());
  const result = scoreSubmission(SPACE_QUESTIONS, parsed.data.answers as RawAnswer[]);
  res.json({ dimensions: result });
});

scoringRouter.post('/score-campaign', (req, res) => {
  const parsed = CampaignSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());
  const { submissions, psychSafetyQuestionNumber } = parsed.data;
  const dims = scoreCampaign(SPACE_QUESTIONS, submissions as RawAnswer[][]);

  // Compute Q7 (psych safety) avg across submissions for the gate alert.
  const q7Values: number[] = [];
  for (const sub of submissions) {
    const a = sub.find((x) => x.questionNumber === psychSafetyQuestionNumber);
    if (a?.rawValue !== null && a?.rawValue !== undefined) q7Values.push(a.rawValue);
  }
  const q7Avg = q7Values.length
    ? q7Values.reduce((a, b) => a + b, 0) / q7Values.length
    : null;

  const byCode = Object.fromEntries(dims.map((d) => [d.code, d])) as Record<
    'S' | 'P' | 'A' | 'C' | 'E',
    DimensionScore
  >;
  const alerts = crossPatternAlerts(byCode, q7Avg);

  res.json({
    dimensions: dims,
    psychSafetyAverage: q7Avg,
    alerts,
    bandReference: {
      CRITICAL: '1.0–2.0',
      SIGNIFICANT: '2.1–2.9',
      MODERATE: '3.0–3.4',
      HEALTHY: '3.5–4.2',
      EXCELLENT: '4.3–5.0',
    },
    helpers: { scoreBand: scoreBand(3.2), priority: bandToPriority('MODERATE') }, // sanity ping
  });
});
