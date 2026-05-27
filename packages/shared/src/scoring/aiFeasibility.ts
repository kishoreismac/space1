import type {
  AIClassification,
  AIFeasibilityInput,
  AIFeasibilityResult,
  AIFeasibilityWeights,
} from '../types/index.js';

/**
 * Default weights. The user spec lists two slightly different weight sets:
 *   • §5 Scoring: 20/20/15/25/20  (TM/IE/CE/DA/DA)
 *   • Worked example XLSX:        25/20/25/15/15
 * We accept either via a `weights` arg. Default below matches the XLSX worked example
 * because that's what existing analysts are calibrated to.
 */
export const DEFAULT_AI_WEIGHTS: AIFeasibilityWeights = {
  toolMaturity: 0.25,
  integrationEase: 0.2,
  costEfficiency: 0.25,
  dataAvailability: 0.15,
  developerAdoption: 0.15,
};

export const SPEC_AI_WEIGHTS: AIFeasibilityWeights = {
  toolMaturity: 0.2,
  integrationEase: 0.2,
  costEfficiency: 0.15,
  dataAvailability: 0.25,
  developerAdoption: 0.2,
};

export interface AIFeasibilityContext {
  highSeverity?: boolean;
  strategicOrHighReach?: boolean;
}

/**
 * Compute a weighted composite score (1–5) and classification.
 * Each subscore is 1–5 (1 worst, 5 best).
 */
export function aiFeasibility(
  input: AIFeasibilityInput,
  weights: AIFeasibilityWeights = DEFAULT_AI_WEIGHTS,
  context: AIFeasibilityContext = {},
): AIFeasibilityResult {
  const total =
    weights.toolMaturity +
    weights.integrationEase +
    weights.costEfficiency +
    weights.dataAvailability +
    weights.developerAdoption;
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error(`AI feasibility weights must sum to 1.0 (got ${total})`);
  }
  const composite =
    input.toolMaturity * weights.toolMaturity +
    input.integrationEase * weights.integrationEase +
    input.costEfficiency * weights.costEfficiency +
    input.dataAvailability * weights.dataAvailability +
    input.developerAdoption * weights.developerAdoption;
  const rounded = Math.round(composite * 100) / 100;
  return { weightedScore: rounded, classification: classify(rounded, context) };
}

function classify(
  composite: number,
  context: AIFeasibilityContext,
): AIClassification {
  if (composite >= 4.0 && context.highSeverity) return 'QUICK_WIN';
  if (composite >= 3.5 && context.strategicOrHighReach) return 'STRATEGIC_BET';
  if (composite >= 2.5) return 'MONITOR';
  return 'DEFER';
}
