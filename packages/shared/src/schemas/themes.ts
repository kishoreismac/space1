import { z } from 'zod';

// ─── Themes ────────────────────────────────────────────────────────────
export const ThemeStatusEnum = z.enum(['PROMOTE', 'INVESTIGATE', 'MONITOR']);
export type ThemeStatusValue = z.infer<typeof ThemeStatusEnum>;

export const ThemeCreateSchema = z.object({
  themeName: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  sourceQuestionId: z.string().optional().nullable(),
  sourceType: z
    .enum(['Numeric Question', 'Text Question', 'Cross-Dimension Metric'])
    .optional()
    .nullable(),
  representativeQuote: z.string().max(2000).optional().nullable(),
  jtbdStatement: z.string().max(2000).optional().nullable(),
  status: ThemeStatusEnum.optional(),
});
export type ThemeCreateRequest = z.infer<typeof ThemeCreateSchema>;

export const ThemeUpdateSchema = ThemeCreateSchema.partial();

export const ThemeSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  themeName: z.string(),
  description: z.string().nullable(),
  sourceQuestionId: z.string().nullable(),
  sourceType: z.string().nullable(),
  representativeQuote: z.string().nullable(),
  jtbdStatement: z.string().nullable(),
  status: ThemeStatusEnum,
  respondentCount: z.number().int(),
  percentage: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const ThemeTagRequestSchema = z.object({
  answerId: z.string().min(1),
});
