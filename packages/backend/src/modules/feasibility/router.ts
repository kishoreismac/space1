import { Router } from 'express';
import { ZodError } from 'zod';
import {
  FeasibilityUpsertSchema,
  classifyComposite,
  computeCompositeScore,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const feasibilityRouter = Router({ mergeParams: true });
feasibilityRouter.use(requireAuth);

function zodToHttp(err: ZodError): HttpError {
  return new HttpError(400, 'Invalid request body', err.issues);
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

async function loadBlocker(campaignId: string, blockerId: string) {
  const b = await prisma.blocker.findUnique({ where: { id: blockerId } });
  if (!b || b.campaignId !== campaignId) throw new HttpError(404, 'Blocker not found');
  return b;
}

// ─── Per-blocker feasibility upsert ────────────────────────────────────
feasibilityRouter.get('/blockers/:blockerId/feasibility', async (req, res, next) => {
  try {
    const { companyId, campaignId, blockerId } = req.params as {
      companyId: string;
      campaignId: string;
      blockerId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    await loadBlocker(campaignId, blockerId);
    const f = await prisma.aIFeasibilityScore.findUnique({ where: { blockerId } });
    res.json(f);
  } catch (e) {
    next(e);
  }
});

feasibilityRouter.put(
  '/blockers/:blockerId/feasibility',
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
      await loadBlocker(campaignId, blockerId);
      const body = FeasibilityUpsertSchema.parse(req.body);
      const composite = computeCompositeScore(body);
      const classification = classifyComposite(composite);
      const data = {
        toolMaturityScore: body.toolMaturityScore,
        integrationEaseScore: body.integrationEaseScore,
        costEfficiencyScore: body.costEfficiencyScore,
        dataAvailabilityScore: body.dataAvailabilityScore,
        developerAdoptionScore: body.developerAdoptionScore,
        weightedCompositeScore: composite,
        classification,
        notes: body.notes ?? null,
      };
      const saved = await prisma.aIFeasibilityScore.upsert({
        where: { blockerId },
        update: data,
        create: { blockerId, ...data },
      });
      // Mirror classification onto the blocker.aiFit field so the
      // triangulation view stays in sync.
      await prisma.blocker.update({
        where: { id: blockerId },
        data: { aiFit: classification },
      });
      res.json(saved);
    } catch (e) {
      if (e instanceof ZodError) return next(zodToHttp(e));
      next(e);
    }
  },
);

feasibilityRouter.delete(
  '/blockers/:blockerId/feasibility',
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
      await loadBlocker(campaignId, blockerId);
      await prisma.aIFeasibilityScore.deleteMany({ where: { blockerId } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ─── Roadmap ───────────────────────────────────────────────────────────
// Score each scored blocker by (impact × feasibility) and bucket into
// Now / Next / Later based on quartiles.
feasibilityRouter.get('/roadmap', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);

    const blockers = await prisma.blocker.findMany({
      where: { campaignId },
      include: { feasibility: true },
    });

    const SEVERITY_IMPACT: Record<string, number> = { P1: 5, P2: 4, P3: 3, P4: 2 };

    const rows = blockers.map((b) => {
      const sevImpact = SEVERITY_IMPACT[b.severity] ?? 3;
      // reach 0-100 → 0-5
      const reachImpact = b.reachPercentage ? (b.reachPercentage / 100) * 5 : 0;
      // hours 0-40+/wk → 0-5 (cap at 40)
      const hoursImpact = Math.min((b.estimatedHoursLost ?? 0) / 8, 5);
      const impactScore =
        Math.round(((sevImpact + reachImpact + hoursImpact) / 3) * 100) / 100;
      const feasibility = b.feasibility?.weightedCompositeScore ?? 0;
      const priorityScore = Math.round(impactScore * feasibility * 100) / 100;
      return {
        blockerId: b.id,
        title: b.title,
        severity: b.severity,
        reachPercentage: b.reachPercentage,
        estimatedHoursLost: b.estimatedHoursLost,
        impactScore,
        feasibilityScore: feasibility,
        feasibilityClass: b.feasibility?.classification ?? null,
        priorityScore,
        aiFit: b.aiFit,
        status: b.status,
      };
    });

    // Now: STRONG_FIT or top-third priority. Next: CANDIDATE / mid third.
    // Later: rest. DROPPED / NOT_FIT blockers are filtered out of roadmap.
    const eligible = rows.filter(
      (r) => r.status !== 'DROPPED' && r.feasibilityClass !== 'NOT_FIT',
    );
    eligible.sort((a, b) => b.priorityScore - a.priorityScore);

    const now: typeof eligible = [];
    const next: typeof eligible = [];
    const later: typeof eligible = [];
    for (const r of eligible) {
      if (r.feasibilityClass === 'STRONG_FIT' && r.priorityScore > 0) now.push(r);
      else if (
        r.feasibilityClass === 'CANDIDATE' ||
        (r.feasibilityClass === null && r.priorityScore === 0)
      )
        next.push(r);
      else later.push(r);
    }

    res.json({
      now,
      next,
      later,
      excluded: rows.filter(
        (r) => r.status === 'DROPPED' || r.feasibilityClass === 'NOT_FIT',
      ),
      summary: {
        total: rows.length,
        scored: rows.filter((r) => r.feasibilityScore > 0).length,
        unscored: rows.filter((r) => r.feasibilityScore === 0).length,
      },
    });
  } catch (e) {
    next(e);
  }
});
