import { z } from 'zod';

// ─── Questionnaire (read-only shape exposed to clients) ────────────────
export const QuestionTypeEnum = z.enum(['LIKERT', 'OPEN_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE']);
export type QuestionTypeValue = z.infer<typeof QuestionTypeEnum>;

export const PublicQuestionSchema = z.object({
  id: z.string(),
  questionNumber: z.number().int(),
  dimensionCode: z.string(),
  text: z.string(),
  type: QuestionTypeEnum,
  isReverseScored: z.boolean(),
  isRequired: z.boolean(),
  minScale: z.number().int().nullable(),
  maxScale: z.number().int().nullable(),
  lowLabel: z.string().nullable(),
  highLabel: z.string().nullable(),
  blockerSignal: z.string().nullable(),
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const PublicQuestionnaireSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  estimatedMinutes: z.number().int(),
  isAnonymous: z.boolean(),
  questions: z.array(PublicQuestionSchema),
});
export type PublicQuestionnaire = z.infer<typeof PublicQuestionnaireSchema>;

// ─── Campaigns ─────────────────────────────────────────────────────────
export const CampaignStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
export type CampaignStatusValue = z.infer<typeof CampaignStatusEnum>;

export const CampaignCreateSchema = z.object({
  questionnaireId: z.string().min(1),
  title: z.string().min(1).max(200),
  cycle: z.string().max(50).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  closeDate: z.string().datetime().optional().nullable(),
  targetRespondents: z.number().int().positive().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});
export type CampaignCreateRequest = z.infer<typeof CampaignCreateSchema>;

export const CampaignUpdateSchema = CampaignCreateSchema.partial().extend({
  status: CampaignStatusEnum.optional(),
});

export const CampaignSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  questionnaireId: z.string(),
  title: z.string(),
  cycle: z.string().nullable(),
  startDate: z.string().nullable(),
  closeDate: z.string().nullable(),
  targetRespondents: z.number().int().nullable(),
  status: CampaignStatusEnum,
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// ─── Invites ───────────────────────────────────────────────────────────
export const InviteStatusEnum = z.enum(['SENT', 'STARTED', 'COMPLETED', 'EXPIRED', 'VOIDED']);
export type InviteStatusValue = z.infer<typeof InviteStatusEnum>;

export const InviteBatchCreateSchema = z.object({
  count: z.number().int().positive().max(500).optional(),
  invites: z
    .array(
      z.object({
        participantEmail: z.string().email().optional().nullable(),
        participantName: z.string().max(200).optional().nullable(),
        teamId: z.string().optional().nullable(),
        roleLabel: z.string().max(120).optional().nullable(),
      }),
    )
    .optional(),
});
export type InviteBatchCreateRequest = z.infer<typeof InviteBatchCreateSchema>;

export const InviteSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  participantEmail: z.string().nullable(),
  participantName: z.string().nullable(),
  teamId: z.string().nullable(),
  roleLabel: z.string().nullable(),
  uniqueToken: z.string(),
  status: InviteStatusEnum,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Invite = z.infer<typeof InviteSchema>;

// ─── Submission (public submit) ────────────────────────────────────────
export const SubmissionAnswerSchema = z.object({
  questionNumber: z.number().int().positive(),
  rawValue: z.number().int().min(1).max(5).nullable().optional(),
  textValue: z.string().max(4000).nullable().optional(),
});
export type SubmissionAnswerInput = z.infer<typeof SubmissionAnswerSchema>;

export const SubmissionPayloadSchema = z.object({
  teamId: z.string().optional().nullable(),
  roleLabel: z.string().max(120).optional().nullable(),
  yearsAtCompany: z.string().max(60).optional().nullable(),
  primaryTechnology: z.string().max(120).optional().nullable(),
  answers: z.array(SubmissionAnswerSchema).min(1),
});
export type SubmissionPayload = z.infer<typeof SubmissionPayloadSchema>;

// ─── Public survey landing ─────────────────────────────────────────────
export const PublicSurveyContextSchema = z.object({
  campaign: z.object({
    id: z.string(),
    title: z.string(),
    cycle: z.string().nullable(),
    closeDate: z.string().nullable(),
  }),
  company: z.object({
    id: z.string(),
    name: z.string(),
  }),
  invite: z.object({
    id: z.string(),
    status: InviteStatusEnum,
    teamId: z.string().nullable(),
    roleLabel: z.string().nullable(),
  }),
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
  questionnaire: PublicQuestionnaireSchema,
});
export type PublicSurveyContext = z.infer<typeof PublicSurveyContextSchema>;
