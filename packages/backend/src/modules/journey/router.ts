import { Router } from 'express';
import { ZodError } from 'zod';
import {
  JourneySessionCreateSchema,
  JourneySessionUpdateSchema,
  JourneyStepCreateSchema,
  JourneyStepReorderSchema,
  JourneyStepUpdateSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const journeyRouter = Router({ mergeParams: true });
journeyRouter.use(requireAuth);

function handleZod(err: ZodError): HttpError {
  return new HttpError(400, 'Invalid request body', err.issues);
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

async function loadSession(campaignId: string, sessionId: string) {
  const s = await prisma.journeyMapSession.findUnique({ where: { id: sessionId } });
  if (!s || s.campaignId !== campaignId) throw new HttpError(404, 'Session not found');
  return s;
}

// ─── Sessions ──────────────────────────────────────────────────────────
journeyRouter.get('/', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const items = await prisma.journeyMapSession.findMany({
      where: { campaignId },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { steps: true } },
      },
    });
    res.json({
      items: items.map((s) => ({
        id: s.id,
        teamId: s.teamId,
        teamName: s.team?.name ?? null,
        facilitator: s.facilitator,
        sessionDate: s.sessionDate,
        participantCount: s.participantCount,
        notes: s.notes,
        createdAt: s.createdAt,
        stepCount: s._count.steps,
      })),
    });
  } catch (e) {
    next(e);
  }
});

journeyRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as {
        companyId: string;
        campaignId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const body = JourneySessionCreateSchema.parse(req.body);
      if (body.teamId) {
        const t = await prisma.team.findUnique({ where: { id: body.teamId } });
        if (!t || t.companyId !== companyId) throw new HttpError(400, 'Team not found');
      }
      const created = await prisma.journeyMapSession.create({
        data: {
          campaignId,
          teamId: body.teamId ?? null,
          facilitator: body.facilitator ?? null,
          sessionDate: body.sessionDate ? new Date(body.sessionDate) : null,
          participantCount: body.participantCount ?? 0,
          notes: body.notes ?? null,
        },
      });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

journeyRouter.patch(
  '/:sessionId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      const body = JourneySessionUpdateSchema.parse(req.body);
      const data: Record<string, unknown> = {};
      if (body.teamId !== undefined) data.teamId = body.teamId;
      if (body.facilitator !== undefined) data.facilitator = body.facilitator;
      if (body.sessionDate !== undefined)
        data.sessionDate = body.sessionDate ? new Date(body.sessionDate) : null;
      if (body.participantCount !== undefined)
        data.participantCount = body.participantCount;
      if (body.notes !== undefined) data.notes = body.notes;
      const updated = await prisma.journeyMapSession.update({
        where: { id: sessionId },
        data,
      });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

journeyRouter.delete(
  '/:sessionId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      await prisma.journeyMapSession.delete({ where: { id: sessionId } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ─── Steps ─────────────────────────────────────────────────────────────
journeyRouter.get('/:sessionId/steps', async (req, res, next) => {
  try {
    const { companyId, campaignId, sessionId } = req.params as {
      companyId: string;
      campaignId: string;
      sessionId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    await loadSession(campaignId, sessionId);
    const steps = await prisma.journeyMapStep.findMany({
      where: { sessionId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    res.json({ items: steps });
  } catch (e) {
    next(e);
  }
});

journeyRouter.post(
  '/:sessionId/steps',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      const body = JourneyStepCreateSchema.parse(req.body);
      // Auto-assign displayOrder if not supplied / 0
      let order = body.displayOrder ?? 0;
      if (!order) {
        const last = await prisma.journeyMapStep.findFirst({
          where: { sessionId },
          orderBy: { displayOrder: 'desc' },
        });
        order = (last?.displayOrder ?? 0) + 10;
      }
      const created = await prisma.journeyMapStep.create({
        data: {
          sessionId,
          stepName: body.stepName,
          description: body.description ?? null,
          timeSpent: body.timeSpent ?? null,
          frictionLevel: body.frictionLevel ?? 'GREEN',
          dotVotes: body.dotVotes ?? 0,
          quote: body.quote ?? null,
          rootCause: body.rootCause ?? null,
          jtbdStatement: body.jtbdStatement ?? null,
          displayOrder: order,
        },
      });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

journeyRouter.patch(
  '/:sessionId/steps/:stepId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId, stepId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
        stepId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      const existing = await prisma.journeyMapStep.findUnique({ where: { id: stepId } });
      if (!existing || existing.sessionId !== sessionId)
        throw new HttpError(404, 'Step not found');
      const body = JourneyStepUpdateSchema.parse(req.body);
      const updated = await prisma.journeyMapStep.update({
        where: { id: stepId },
        data: body,
      });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

journeyRouter.delete(
  '/:sessionId/steps/:stepId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId, stepId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
        stepId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      const existing = await prisma.journeyMapStep.findUnique({ where: { id: stepId } });
      if (!existing || existing.sessionId !== sessionId)
        throw new HttpError(404, 'Step not found');
      await prisma.journeyMapStep.delete({ where: { id: stepId } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

journeyRouter.post(
  '/:sessionId/steps/reorder',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, sessionId } = req.params as {
        companyId: string;
        campaignId: string;
        sessionId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      await loadSession(campaignId, sessionId);
      const { stepIds } = JourneyStepReorderSchema.parse(req.body);
      const existing = await prisma.journeyMapStep.findMany({
        where: { sessionId },
        select: { id: true },
      });
      const knownIds = new Set(existing.map((s) => s.id));
      for (const id of stepIds) {
        if (!knownIds.has(id)) throw new HttpError(400, `Step ${id} not in session`);
      }
      await prisma.$transaction(
        stepIds.map((id, i) =>
          prisma.journeyMapStep.update({
            where: { id },
            data: { displayOrder: (i + 1) * 10 },
          }),
        ),
      );
      const items = await prisma.journeyMapStep.findMany({
        where: { sessionId },
        orderBy: { displayOrder: 'asc' },
      });
      res.json({ items });
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

// ─── Summary heatmap ───────────────────────────────────────────────────
journeyRouter.get('/:sessionId/summary', async (req, res, next) => {
  try {
    const { companyId, campaignId, sessionId } = req.params as {
      companyId: string;
      campaignId: string;
      sessionId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    await loadSession(campaignId, sessionId);
    const steps = await prisma.journeyMapStep.findMany({
      where: { sessionId },
      orderBy: { displayOrder: 'asc' },
    });
    const totalVotes = steps.reduce((sum, s) => sum + s.dotVotes, 0);
    const counts = { GREEN: 0, YELLOW: 0, RED: 0 } as Record<string, number>;
    for (const s of steps) counts[s.frictionLevel] = (counts[s.frictionLevel] ?? 0) + 1;
    const topPainPoints = [...steps]
      .filter((s) => s.frictionLevel === 'RED' || s.dotVotes > 0)
      .sort((a, b) => b.dotVotes - a.dotVotes)
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        stepName: s.stepName,
        dotVotes: s.dotVotes,
        frictionLevel: s.frictionLevel,
        rootCause: s.rootCause,
        jtbdStatement: s.jtbdStatement,
      }));
    res.json({
      stepCount: steps.length,
      totalVotes,
      frictionCounts: counts,
      topPainPoints,
    });
  } catch (e) {
    next(e);
  }
});
