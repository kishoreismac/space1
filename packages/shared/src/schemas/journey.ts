import { z } from 'zod';

export const FrictionLevelEnum = z.enum(['GREEN', 'YELLOW', 'RED']);
export type FrictionLevel = z.infer<typeof FrictionLevelEnum>;

export const JourneySessionCreateSchema = z.object({
  teamId: z.string().cuid().nullable().optional(),
  facilitator: z.string().min(1).max(200).nullable().optional(),
  sessionDate: z.string().datetime().nullable().optional(),
  participantCount: z.number().int().min(0).max(1000).default(0),
  notes: z.string().max(5000).nullable().optional(),
});
export const JourneySessionUpdateSchema = JourneySessionCreateSchema.partial();

export const JourneyStepCreateSchema = z.object({
  stepName: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  timeSpent: z.string().max(100).nullable().optional(),
  frictionLevel: FrictionLevelEnum.default('GREEN'),
  dotVotes: z.number().int().min(0).max(10000).default(0),
  quote: z.string().max(2000).nullable().optional(),
  rootCause: z.string().max(2000).nullable().optional(),
  jtbdStatement: z.string().max(2000).nullable().optional(),
  displayOrder: z.number().int().min(0).default(0),
});
export const JourneyStepUpdateSchema = JourneyStepCreateSchema.partial();

export const JourneyStepReorderSchema = z.object({
  stepIds: z.array(z.string().cuid()).min(1),
});

export type JourneySessionInput = z.infer<typeof JourneySessionCreateSchema>;
export type JourneyStepInput = z.infer<typeof JourneyStepCreateSchema>;
