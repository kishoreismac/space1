import { z } from 'zod';

export const SeverityEnum = z.enum(['P1', 'P2', 'P3', 'P4']);
export const AIFitEnum = z.enum(['INVESTIGATE', 'CANDIDATE', 'STRONG_FIT', 'NOT_FIT']);
export const BlockerStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DROPPED']);
export const SourcePhaseEnum = z.enum([
  'QUANTITATIVE',
  'OPEN_TEXT',
  'JOURNEY',
  'TRIANGULATION',
  'MANUAL',
]);

export const BlockerCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  sourcePhase: SourcePhaseEnum.default('TRIANGULATION'),
  dimensionCode: z.string().max(50).nullable().optional(),
  sdlcPhase: z.string().max(100).nullable().optional(),
  severity: SeverityEnum.default('P3'),
  affectedTeams: z.string().max(500).nullable().optional(),
  reachPercentage: z.number().min(0).max(100).nullable().optional(),
  estimatedHoursLost: z.number().min(0).nullable().optional(),
  evidenceSummary: z.string().max(5000).nullable().optional(),
  aiFit: AIFitEnum.default('INVESTIGATE'),
  status: BlockerStatusEnum.default('OPEN'),
});
export const BlockerUpdateSchema = BlockerCreateSchema.partial();

export const SignalTypeEnum = z.enum([
  'DORA',
  'PR',
  'CICD',
  'IDE',
  'INCIDENT',
  'CALENDAR',
  'SLACK',
  'JOURNEY_MAP',
  'SURVEY',
  'THEME',
  'OTHER',
]);

export const SignalCreateSchema = z.object({
  blockerId: z.string().cuid().nullable().optional(),
  signalType: SignalTypeEnum,
  signalName: z.string().min(1).max(200),
  evidenceValue: z.string().max(500).nullable().optional(),
  evidenceDescription: z.string().max(5000).nullable().optional(),
  confirmed: z.boolean().default(false),
});
export const SignalUpdateSchema = SignalCreateSchema.partial();

export type BlockerInput = z.infer<typeof BlockerCreateSchema>;
export type SignalInput = z.infer<typeof SignalCreateSchema>;
