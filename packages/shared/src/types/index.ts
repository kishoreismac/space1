export type DimensionCode = 'S' | 'P' | 'A' | 'C' | 'E';

export type QuestionType = 'LIKERT' | 'OPEN_TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE';

export type ScoreBand =
  | 'CRITICAL'
  | 'SIGNIFICANT'
  | 'MODERATE'
  | 'HEALTHY'
  | 'EXCELLENT';

export type Priority = 'P1' | 'P2' | 'P3' | 'MONITOR';

export type AIClassification =
  | 'QUICK_WIN'
  | 'STRATEGIC_BET'
  | 'MONITOR'
  | 'DEFER';

export interface QuestionDef {
  number: number;
  dimensionCode: DimensionCode;
  text: string;
  type: QuestionType;
  isReverseScored: boolean;
  isRequired: boolean;
  minScale?: number;
  maxScale?: number;
  lowLabel?: string;
  highLabel?: string;
  blockerSignal?: string;
  tooltipText?: string;
}

export interface DimensionDef {
  code: DimensionCode;
  name: string;
  description: string;
  color: string;
}

/** An answer as it lives in storage (raw value before reverse). */
export interface RawAnswer {
  questionNumber: number;
  rawValue: number | null;
  textValue?: string | null;
}

export interface DimensionScore {
  code: DimensionCode;
  name: string;
  averageScore: number | null;
  responseCount: number;
  band: ScoreBand | null;
  priority: Priority;
}

export interface CrossPatternAlert {
  code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  patternId?: string;
  crossPattern?: string;
  trigger?: string;
  scoreSignal?: string;
  diagnosis?: string;
  whatItMeans?: string;
  likelyRootCause?: string;
  validationEvidence?: string;
  leadershipAction?: string;
}

export interface AIFeasibilityInput {
  toolMaturity: number;
  integrationEase: number;
  costEfficiency: number;
  dataAvailability: number;
  developerAdoption: number;
}

export interface AIFeasibilityWeights {
  toolMaturity: number;
  integrationEase: number;
  costEfficiency: number;
  dataAvailability: number;
  developerAdoption: number;
}

export interface AIFeasibilityResult {
  weightedScore: number;
  classification: AIClassification;
}
