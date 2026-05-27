import { Router } from 'express';
import { ZodError } from 'zod';
import {
  BlockerCreateSchema,
  BlockerUpdateSchema,
  SignalCreateSchema,
  SignalUpdateSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const triangulationRouter = Router({ mergeParams: true });
triangulationRouter.use(requireAuth);

function handleZod(err: ZodError): HttpError {
  return new HttpError(400, 'Invalid request body', err.issues);
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

// ─── Blockers ──────────────────────────────────────────────────────────
triangulationRouter.get('/blockers', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const items = await prisma.blocker.findMany({
      where: { campaignId },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { signals: true } },
        feasibility: {
          select: { weightedCompositeScore: true, classification: true },
        },
      },
    });
    res.json({
      items: items.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        sourcePhase: b.sourcePhase,
        dimensionCode: b.dimensionCode,
        sdlcPhase: b.sdlcPhase,
        severity: b.severity,
        affectedTeams: b.affectedTeams,
        reachPercentage: b.reachPercentage,
        estimatedHoursLost: b.estimatedHoursLost,
        evidenceSummary: b.evidenceSummary,
        aiFit: b.aiFit,
        status: b.status,
        signalCount: b._count.signals,
        feasibilityScore: b.feasibility?.weightedCompositeScore ?? null,
        feasibilityClass: b.feasibility?.classification ?? null,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

triangulationRouter.post(
  '/blockers',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as {
        companyId: string;
        campaignId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const body = BlockerCreateSchema.parse(req.body);
      const created = await prisma.blocker.create({
        data: {
          campaignId,
          title: body.title,
          description: body.description ?? null,
          sourcePhase: body.sourcePhase ?? 'TRIANGULATION',
          dimensionCode: body.dimensionCode ?? null,
          sdlcPhase: body.sdlcPhase ?? null,
          severity: body.severity ?? 'P3',
          affectedTeams: body.affectedTeams ?? null,
          reachPercentage: body.reachPercentage ?? null,
          estimatedHoursLost: body.estimatedHoursLost ?? null,
          evidenceSummary: body.evidenceSummary ?? null,
          aiFit: body.aiFit ?? 'INVESTIGATE',
          status: body.status ?? 'OPEN',
        },
      });
      recordAudit(req, 'blocker.create', 'Blocker', created.id, { title: created.title, severity: created.severity });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

triangulationRouter.patch(
  '/blockers/:blockerId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, blockerId } = req.params as {
        companyId: string;
        campaignId: string;
        blockerId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const existing = await prisma.blocker.findUnique({ where: { id: blockerId } });
      if (!existing || existing.campaignId !== campaignId)
        throw new HttpError(404, 'Blocker not found');
      const body = BlockerUpdateSchema.parse(req.body);
      const updated = await prisma.blocker.update({
        where: { id: blockerId },
        data: body,
      });
      recordAudit(req, 'blocker.update', 'Blocker', updated.id, body as Record<string, unknown>);
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

triangulationRouter.delete(
  '/blockers/:blockerId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, blockerId } = req.params as {
        companyId: string;
        campaignId: string;
        blockerId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const existing = await prisma.blocker.findUnique({ where: { id: blockerId } });
      if (!existing || existing.campaignId !== campaignId)
        throw new HttpError(404, 'Blocker not found');
      await prisma.blocker.delete({ where: { id: blockerId } });
      recordAudit(req, 'blocker.delete', 'Blocker', blockerId);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ─── Signals ───────────────────────────────────────────────────────────
triangulationRouter.get('/blockers/:blockerId/signals', async (req, res, next) => {
  try {
    const { companyId, campaignId, blockerId } = req.params as {
      companyId: string;
      campaignId: string;
      blockerId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
    if (!blocker || blocker.campaignId !== campaignId)
      throw new HttpError(404, 'Blocker not found');
    const items = await prisma.validationSignal.findMany({
      where: { blockerId },
      orderBy: [{ confirmed: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

triangulationRouter.post(
  '/blockers/:blockerId/signals',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, blockerId } = req.params as {
        companyId: string;
        campaignId: string;
        blockerId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
      if (!blocker || blocker.campaignId !== campaignId)
        throw new HttpError(404, 'Blocker not found');
      const body = SignalCreateSchema.parse(req.body);
      const created = await prisma.validationSignal.create({
        data: {
          campaignId,
          blockerId,
          signalType: body.signalType,
          signalName: body.signalName,
          evidenceValue: body.evidenceValue ?? null,
          evidenceDescription: body.evidenceDescription ?? null,
          confirmed: body.confirmed ?? false,
        },
      });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

triangulationRouter.patch(
  '/signals/:signalId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, signalId } = req.params as {
        companyId: string;
        campaignId: string;
        signalId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const existing = await prisma.validationSignal.findUnique({
        where: { id: signalId },
      });
      if (!existing || existing.campaignId !== campaignId)
        throw new HttpError(404, 'Signal not found');
      const body = SignalUpdateSchema.parse(req.body);
      const updated = await prisma.validationSignal.update({
        where: { id: signalId },
        data: body,
      });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

triangulationRouter.delete(
  '/signals/:signalId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, signalId } = req.params as {
        companyId: string;
        campaignId: string;
        signalId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const existing = await prisma.validationSignal.findUnique({
        where: { id: signalId },
      });
      if (!existing || existing.campaignId !== campaignId)
        throw new HttpError(404, 'Signal not found');
      await prisma.validationSignal.delete({ where: { id: signalId } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ─── Candidate suggestions ─────────────────────────────────────────────
// Auto-derive candidate blockers from low-scoring dimensions, top themes,
// and red journey steps to seed the triangulation workflow.
triangulationRouter.get('/candidates', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);

    // Quant dimensions with avg < 3.5
    const dimAgg = await prisma.$queryRawUnsafe<
      { code: string; name: string; avg: number; count: number }[]
    >(
      `SELECT d.code as code, d.name as name,
              AVG(CAST(a.numericValue AS REAL)) as avg,
              COUNT(*) as count
         FROM Answer a
         JOIN Submission s ON s.id = a.submissionId
         JOIN Question q ON q.id = a.questionId
         JOIN QuestionDimension d ON d.id = q.dimensionId
        WHERE s.campaignId = ?
          AND s.status = 'COMPLETED'
          AND a.numericValue IS NOT NULL
        GROUP BY d.id
        HAVING AVG(CAST(a.numericValue AS REAL)) < 3.5
        ORDER BY avg ASC`,
      campaignId,
    );

    // Top themes (PROMOTE or INVESTIGATE) by respondent count
    const themes = await prisma.openTextTheme.findMany({
      where: {
        campaignId,
        status: { in: ['PROMOTE', 'INVESTIGATE'] },
      },
      orderBy: [{ respondentCount: 'desc' }],
      take: 5,
      select: {
        id: true,
        themeName: true,
        respondentCount: true,
        percentage: true,
        jtbdStatement: true,
        status: true,
      },
    });

    // Red journey steps
    const redSteps = await prisma.journeyMapStep.findMany({
      where: {
        session: { campaignId },
        frictionLevel: 'RED',
      },
      orderBy: { dotVotes: 'desc' },
      take: 5,
      include: { session: { select: { facilitator: true } } },
    });

    res.json({
      dimensions: dimAgg.map((d) => ({
        code: d.code,
        name: d.name,
        avgScore: Number(d.avg.toFixed(2)),
        responses: Number(d.count),
      })),
      themes,
      journeySteps: redSteps.map((s) => ({
        id: s.id,
        stepName: s.stepName,
        dotVotes: s.dotVotes,
        rootCause: s.rootCause,
        jtbdStatement: s.jtbdStatement,
        facilitator: s.session.facilitator,
      })),
    });
  } catch (e) {
    next(e);
  }
});
