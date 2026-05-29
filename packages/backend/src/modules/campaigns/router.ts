import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import {
  CampaignCreateSchema,
  CampaignUpdateSchema,
  InviteBatchCreateSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const campaignsRouter = Router({ mergeParams: true });
campaignsRouter.use(requireAuth);

function handleZod(err: unknown): never {
  if (err instanceof ZodError) {
    throw new HttpError(400, 'Invalid request body', err.issues);
  }
  throw err;
}

function generateToken(): string {
  // URL-safe ~22 char token (16 bytes base64url)
  return randomBytes(16).toString('base64url');
}

async function loadCampaignInCompany(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) {
    throw new HttpError(404, 'Campaign not found');
  }
  return c;
}

// ─── Campaigns ─────────────────────────────────────────────────────────
campaignsRouter.get('/', async (req, res, next) => {
  try {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req.auth, companyId);
    const items = await prisma.surveyCampaign.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

campaignsRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId } = req.params as { companyId: string };
      assertCompanyAccess(req.auth, companyId);
      const body = CampaignCreateSchema.parse(req.body);

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id: body.questionnaireId },
      });
      if (!questionnaire) throw new HttpError(404, 'Questionnaire not found');
      if (questionnaire.companyId && questionnaire.companyId !== companyId) {
        throw new HttpError(403, 'Questionnaire belongs to another company');
      }

      const created = await prisma.surveyCampaign.create({
        data: {
          companyId,
          questionnaireId: body.questionnaireId,
          title: body.title,
          cycle: body.cycle ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          closeDate: body.closeDate ? new Date(body.closeDate) : null,
          targetRespondents: body.targetRespondents ?? null,
          notes: body.notes ?? null,
          assessmentLead: body.assessmentLead ?? null,
          vpEmail: body.vpEmail ?? null,
          previousCycleLabel: body.previousCycleLabel ?? null,
          previousS: body.previousS ?? null,
          previousP: body.previousP ?? null,
          previousA: body.previousA ?? null,
          previousC: body.previousC ?? null,
          previousE: body.previousE ?? null,
          execSummarySubject: body.execSummarySubject ?? null,
          execSummaryFindings: body.execSummaryFindings ?? null,
          execSummaryNextSteps: body.execSummaryNextSteps ?? null,
          execSummaryImmediate: body.execSummaryImmediate ?? null,
          createdById: req.auth!.sub,
        },
      });
      recordAudit(req, 'campaign.create', 'SurveyCampaign', created.id, { title: created.title });
      res.status(201).json(created);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

campaignsRouter.get('/:campaignId', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const c = await loadCampaignInCompany(companyId, campaignId);
    const [inviteCount, submissionCount, completedInvites] = await Promise.all([
      prisma.surveyInvite.count({ where: { campaignId } }),
      prisma.submission.count({ where: { campaignId, status: 'COMPLETED' } }),
      prisma.surveyInvite.count({ where: { campaignId, status: 'COMPLETED' } }),
    ]);
    res.json({ ...c, stats: { inviteCount, submissionCount, completedInvites } });
  } catch (e) { next(e); }
});

campaignsRouter.patch(
  '/:campaignId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaignInCompany(companyId, campaignId);
      const body = CampaignUpdateSchema.parse(req.body);
      const updated = await prisma.surveyCampaign.update({
        where: { id: campaignId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.cycle !== undefined ? { cycle: body.cycle } : {}),
          ...(body.startDate !== undefined
            ? { startDate: body.startDate ? new Date(body.startDate) : null }
            : {}),
          ...(body.closeDate !== undefined
            ? { closeDate: body.closeDate ? new Date(body.closeDate) : null }
            : {}),
          ...(body.targetRespondents !== undefined
            ? { targetRespondents: body.targetRespondents }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.assessmentLead !== undefined ? { assessmentLead: body.assessmentLead } : {}),
          ...(body.vpEmail !== undefined ? { vpEmail: body.vpEmail } : {}),
          ...(body.previousCycleLabel !== undefined ? { previousCycleLabel: body.previousCycleLabel } : {}),
          ...(body.previousS !== undefined ? { previousS: body.previousS } : {}),
          ...(body.previousP !== undefined ? { previousP: body.previousP } : {}),
          ...(body.previousA !== undefined ? { previousA: body.previousA } : {}),
          ...(body.previousC !== undefined ? { previousC: body.previousC } : {}),
          ...(body.previousE !== undefined ? { previousE: body.previousE } : {}),
          ...(body.execSummarySubject !== undefined ? { execSummarySubject: body.execSummarySubject } : {}),
          ...(body.execSummaryFindings !== undefined ? { execSummaryFindings: body.execSummaryFindings } : {}),
          ...(body.execSummaryNextSteps !== undefined ? { execSummaryNextSteps: body.execSummaryNextSteps } : {}),
          ...(body.execSummaryImmediate !== undefined ? { execSummaryImmediate: body.execSummaryImmediate } : {}),
        },
      });
      if (body.status !== undefined) {
        recordAudit(req, `campaign.status.${body.status.toLowerCase()}`, 'SurveyCampaign', updated.id);
      } else {
        recordAudit(req, 'campaign.update', 'SurveyCampaign', updated.id);
      }
      res.json(updated);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

// ─── Clone for next cycle ──────────────────────────────────────────────
campaignsRouter.post(
  '/:campaignId/clone',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const source = await loadCampaignInCompany(companyId, campaignId);
      const body = z
        .object({
          title: z.string().min(1).max(200).optional(),
          cycle: z.string().max(50).optional().nullable(),
          startDate: z.string().datetime().optional().nullable(),
          closeDate: z.string().datetime().optional().nullable(),
        })
        .parse(req.body ?? {});

      const summaries = await prisma.scoreSummary.findMany({ where: { campaignId } });
      const byDim = new Map(summaries.map((s) => [s.dimensionCode, s.averageScore]));

      const created = await prisma.surveyCampaign.create({
        data: {
          companyId,
          questionnaireId: source.questionnaireId,
          title: body.title ?? `${source.title} (next cycle)`,
          cycle: body.cycle ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          closeDate: body.closeDate ? new Date(body.closeDate) : null,
          targetRespondents: source.targetRespondents,
          notes: source.notes,
          createdById: req.auth!.sub,
          previousS: byDim.get('S') ?? source.previousS ?? null,
          previousP: byDim.get('P') ?? source.previousP ?? null,
          previousA: byDim.get('A') ?? source.previousA ?? null,
          previousC: byDim.get('C') ?? source.previousC ?? null,
          previousE: byDim.get('E') ?? source.previousE ?? null,
        },
      });
      recordAudit(req, 'campaign.clone', 'SurveyCampaign', created.id, { from: source.id });
      res.status(201).json(created);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

// ─── Invites ───────────────────────────────────────────────────────────
campaignsRouter.get('/:campaignId/invites', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaignInCompany(companyId, campaignId);
    const items = await prisma.surveyInvite.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

campaignsRouter.post(
  '/:campaignId/invites',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const campaign = await loadCampaignInCompany(companyId, campaignId);
      if (campaign.status === 'ARCHIVED') {
        throw new HttpError(400, 'Cannot add invites to an archived campaign');
      }
      const body = InviteBatchCreateSchema.parse(req.body);

      // Validate any provided teamIds belong to the company
      const detailed = body.invites ?? [];
      const teamIds = [...new Set(detailed.map((i) => i.teamId).filter(Boolean) as string[])];
      if (teamIds.length > 0) {
        const found = await prisma.team.findMany({
          where: { id: { in: teamIds }, companyId },
          select: { id: true },
        });
        const foundSet = new Set(found.map((t) => t.id));
        const missing = teamIds.filter((id) => !foundSet.has(id));
        if (missing.length > 0) {
          throw new HttpError(400, `Unknown teamId(s): ${missing.join(', ')}`);
        }
      }

      const rows: Array<{
        campaignId: string;
        uniqueToken: string;
        participantEmail: string | null;
        participantName: string | null;
        teamId: string | null;
        roleLabel: string | null;
        sentAt: Date;
      }> = [];

      if (detailed.length > 0) {
        for (const inv of detailed) {
          rows.push({
            campaignId,
            uniqueToken: generateToken(),
            participantEmail: inv.participantEmail ?? null,
            participantName: inv.participantName ?? null,
            teamId: inv.teamId ?? null,
            roleLabel: inv.roleLabel ?? null,
            sentAt: new Date(),
          });
        }
      } else if (body.count) {
        for (let i = 0; i < body.count; i++) {
          rows.push({
            campaignId,
            uniqueToken: generateToken(),
            participantEmail: null,
            participantName: null,
            teamId: null,
            roleLabel: null,
            sentAt: new Date(),
          });
        }
      } else {
        throw new HttpError(400, 'Provide either { count } or { invites: [...] }');
      }

      await prisma.surveyInvite.createMany({ data: rows });
      const tokens = rows.map((r) => r.uniqueToken);
      const created = await prisma.surveyInvite.findMany({
        where: { campaignId, uniqueToken: { in: tokens } },
      });

      // Auto-activate a DRAFT campaign when the first invites are sent.
      if (campaign.status === 'DRAFT') {
        await prisma.surveyCampaign.update({
          where: { id: campaignId },
          data: { status: 'ACTIVE' },
        });
      }

      res.status(201).json({ items: created });
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

campaignsRouter.delete(
  '/:campaignId/invites/:inviteId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, inviteId } = req.params as {
        companyId: string;
        campaignId: string;
        inviteId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const invite = await prisma.surveyInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.campaignId !== campaignId) {
        throw new HttpError(404, 'Invite not found');
      }
      await prisma.surveyInvite.update({
        where: { id: inviteId },
        data: { status: 'VOIDED' },
      });
      res.status(204).end();
    } catch (e) { next(e); }
  },
);
