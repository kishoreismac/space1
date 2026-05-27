import { z } from 'zod';

// Weights documented in docs/AI-feasibility.md
// toolMaturity 0.25, integrationEase 0.20, costEfficiency 0.20,
// dataAvailability 0.20, developerAdoption 0.15
export const FEASIBILITY_WEIGHTS = {
  toolMaturity: 0.25,
  integrationEase: 0.2,
  costEfficiency: 0.2,
  dataAvailability: 0.2,
  developerAdoption: 0.15,
} as const;

export const FeasibilityClassEnum = z.enum([
  'STRONG_FIT',
  'CANDIDATE',
  'INVESTIGATE',
  'NOT_FIT',
]);
export type FeasibilityClass = z.infer<typeof FeasibilityClassEnum>;

const scoreField = z.number().min(0).max(5);

export const FeasibilityUpsertSchema = z.object({
  toolMaturityScore: scoreField,
  integrationEaseScore: scoreField,
  costEfficiencyScore: scoreField,
  dataAvailabilityScore: scoreField,
  developerAdoptionScore: scoreField,
  notes: z.string().max(5000).nullable().optional(),
});

export type FeasibilityInput = z.infer<typeof FeasibilityUpsertSchema>;

/** Returns weighted composite score on 0-5 scale, rounded to 0.01. */
export function computeCompositeScore(input: FeasibilityInput): number {
  const w = FEASIBILITY_WEIGHTS;
  const raw =
    input.toolMaturityScore * w.toolMaturity +
    input.integrationEaseScore * w.integrationEase +
    input.costEfficiencyScore * w.costEfficiency +
    input.dataAvailabilityScore * w.dataAvailability +
    input.developerAdoptionScore * w.developerAdoption;
  return Math.round(raw * 100) / 100;
}

/** Map a composite score to a fit classification. */
export function classifyComposite(score: number): FeasibilityClass {
  if (score >= 4.0) return 'STRONG_FIT';
  if (score >= 3.0) return 'CANDIDATE';
  if (score >= 2.0) return 'INVESTIGATE';
  return 'NOT_FIT';
}
