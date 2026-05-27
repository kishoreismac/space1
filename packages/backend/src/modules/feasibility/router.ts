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

// ─── Program Output: Validated Registry + AI Feasibility Matrix + Summary ──
// All derived from survey-driven blockers and their validation signals.
// If a blocker has no manual feasibility score we auto-compute one purely from
// survey-side heuristics so the page can render end-to-end with no manual input.
feasibilityRouter.get('/program-output', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);

    const [blockers, totalRespondents, dimRows] = await Promise.all([
      prisma.blocker.findMany({
        where: { campaignId },
        include: {
          feasibility: true,
          signals: { select: { signalType: true, confirmed: true } },
        },
      }),
      prisma.submission.count({ where: { campaignId, status: 'COMPLETED' } }),
      prisma.$queryRawUnsafe<{ code: string; avg: number }[]>(
        `SELECT d.code as code, AVG(CAST(a.numericValue AS REAL)) as avg
           FROM Answer a
           JOIN Submission s ON s.id = a.submissionId
           JOIN Question q ON q.id = a.questionId
           JOIN QuestionDimension d ON d.id = q.dimensionId
          WHERE s.campaignId = ? AND s.status = 'COMPLETED' AND a.numericValue IS NOT NULL
          GROUP BY d.id`,
        campaignId,
      ),
    ]);
    const dimAvg = new Map<string, number>();
    for (const d of dimRows) dimAvg.set(d.code, Number(d.avg));

    type Severity = 'P1' | 'P2' | 'P3' | 'P4';
    type Klass = 'STRONG_FIT' | 'CANDIDATE' | 'INVESTIGATE' | 'NOT_FIT';

    // Auto-score from survey-only heuristics (0-5 each), then weighted composite.
    function autoScore(b: typeof blockers[number]): {
      toolMaturity: number; integrationEase: number; costEfficiency: number;
      dataAvailability: number; developerAdoption: number; composite5: number;
      classification: Klass; auto: true;
    } {
      const sigTypes = new Set(b.signals.map((s) => s.signalType));
      const confirmed = b.signals.filter((s) => s.confirmed).length;
      const reach = b.reachPercentage ?? 0;
      const dim = b.dimensionCode ? dimAvg.get(b.dimensionCode) ?? 3 : 3;
      // Tool Maturity: stronger when dimension score is poor AND blocker is on a tooling axis.
      const isToolingPhase = ['Build', 'Coding', 'Test', 'Operations'].some((p) => (b.sdlcPhase ?? '').includes(p));
      const toolMaturity = Math.min(5, Math.max(2,
        (dim < 2.5 ? 5 : dim < 3.0 ? 4 : 3) + (isToolingPhase ? 1 : 0) - 1
      ));
      // Integration Ease: more confirmed survey/quant signals → easier.
      const integrationEase = Math.min(5, Math.max(2, 2 + confirmed));
      // Cost Efficiency: high severity + high reach = better ROI.
      const sevWeight: Record<Severity, number> = { P1: 5, P2: 4, P3: 3, P4: 2 };
      const costEfficiency = Math.min(5, Math.round(((sevWeight[b.severity as Severity] ?? 3) + (reach >= 30 ? 1 : 0)) - 0));
      // Data Availability: number of distinct signal types.
      const dataAvailability = Math.min(5, Math.max(2, sigTypes.size + 1));
      // Developer Adoption: reach %.
      const developerAdoption = reach >= 40 ? 5 : reach >= 25 ? 4 : reach >= 15 ? 3 : 2;

      const w = {
        toolMaturity: 0.25, integrationEase: 0.20, costEfficiency: 0.20,
        dataAvailability: 0.20, developerAdoption: 0.15,
      };
      const composite5 = Math.round(
        (toolMaturity * w.toolMaturity +
          integrationEase * w.integrationEase +
          costEfficiency * w.costEfficiency +
          dataAvailability * w.dataAvailability +
          developerAdoption * w.developerAdoption) * 100,
      ) / 100;
      const classification: Klass =
        composite5 >= 4.0 ? 'STRONG_FIT' :
        composite5 >= 3.0 ? 'CANDIDATE' :
        composite5 >= 2.0 ? 'INVESTIGATE' : 'NOT_FIT';
      return { toolMaturity, integrationEase, costEfficiency, dataAvailability, developerAdoption, composite5, classification, auto: true };
    }

    // Recommended tool stub based on title / dimension.
    function recommendTool(title: string, dim: string | null): string {
      const t = title.toLowerCase();
      if (t.includes('codebase') || t.includes('onboard')) return 'GitHub Copilot + RAG';
      if (t.includes('ci') || t.includes('pipeline') || t.includes('build') || t.includes('flak')) return 'BuildPulse + Harness AI';
      if (t.includes('requirement') || t.includes('spec') || t.includes('clarity')) return 'Custom AC Agent · Jira';
      if (t.includes('incident') || t.includes('rca') || t.includes('outage')) return 'PagerDuty AI + Splunk';
      if (t.includes('review') || t.includes('pr')) return 'GitHub Copilot Reviews';
      if (t.includes('env') || t.includes('local')) return 'Devbox / Coder';
      if (t.includes('doc')) return 'Glean + Notion AI';
      if (t.includes('context') || t.includes('focus') || t.includes('meeting')) return 'Clockwise + Reclaim';
      if (dim === 'S' || dim === 'P') return '— Non-AI workstream';
      return 'TBD · scoping';
    }

    const registry: any[] = [];
    const matrix: any[] = [];
    let quickWins = 0;
    let strategicBets = 0;
    let monitor = 0;
    let nonAi = 0;
    let hoursRecovered = 0;

    blockers.forEach((b, idx) => {
      // Sources
      const sourceTypes = [...new Set(b.signals.map((s) => s.signalType))];
      const sourceConfirmed = b.signals.filter((s) => s.confirmed).length;
      const sourcesLabel = sourceTypes.length === 0
        ? '—'
        : `${sourceTypes.slice(0, 3).join('+')} (${sourceConfirmed}/${b.signals.length || 0})`;
      const dimAvgForB = b.dimensionCode ? dimAvg.get(b.dimensionCode) ?? null : null;

      // Feasibility — use manual score if present, else auto-derive from survey signals.
      const auto = autoScore(b);
      const hasManual = !!b.feasibility;
      const tool = b.feasibility?.notes ?? recommendTool(b.title, b.dimensionCode);
      const composite5 = hasManual ? b.feasibility!.weightedCompositeScore : auto.composite5;
      const classification = (hasManual ? (b.feasibility!.classification as Klass) : auto.classification);

      // Display on 0-10 scale to match the reference UI
      const composite10 = Math.round(composite5 * 2 * 10) / 10;

      // Sequencing band on 0-10 scale: >8 Quick Win, 6-8 Strategic Bet, 4-6 Monitor, <4 Defer.
      // NOT_FIT classification is forced non-AI regardless of score (mgmt/process route).
      let band: 'Quick Win' | 'Strategic Bet' | 'Monitor' | 'Defer' | 'Non-AI' = 'Defer';
      if (classification === 'NOT_FIT' || b.aiFit === 'NOT_FIT') band = 'Non-AI';
      else if (composite10 >= 8.0) band = 'Quick Win';
      else if (composite10 >= 6.0) band = 'Strategic Bet';
      else if (composite10 >= 4.0) band = 'Monitor';
      else band = 'Defer';

      if (band === 'Quick Win') {
        quickWins += 1;
        hoursRecovered += b.estimatedHoursLost ?? Math.round(((b.reachPercentage ?? 0) / 100) * 4);
      } else if (band === 'Strategic Bet') strategicBets += 1;
      else if (band === 'Monitor') monitor += 1;
      else if (band === 'Non-AI') nonAi += 1;

      registry.push({
        n: idx + 1,
        id: b.id,
        title: b.title,
        sdlcPhase: b.sdlcPhase ?? '—',
        dimensionCode: b.dimensionCode ?? '—',
        dimensionScore: dimAvgForB !== null ? Math.round(dimAvgForB * 100) / 100 : null,
        sourcesLabel,
        sourcesConfirmed: sourceConfirmed,
        sourcesTotal: b.signals.length,
        reachPercentage: b.reachPercentage,
        estimatedHoursLost: b.estimatedHoursLost,
        aiFit: band === 'Non-AI' ? 'NO' : 'YES',
        priority: b.severity,
        evidenceSummary: b.evidenceSummary,
      });

      // Only AI Fit entries land in the scoring matrix
      if (band !== 'Non-AI') {
        matrix.push({
          id: b.id,
          title: b.title,
          toolMaturity: hasManual ? Math.round(b.feasibility!.toolMaturityScore) : auto.toolMaturity,
          integrationEase: hasManual ? Math.round(b.feasibility!.integrationEaseScore) : auto.integrationEase,
          costEfficiency: hasManual ? Math.round(b.feasibility!.costEfficiencyScore) : auto.costEfficiency,
          dataAvailability: hasManual ? Math.round(b.feasibility!.dataAvailabilityScore) : auto.dataAvailability,
          developerAdoption: hasManual ? Math.round(b.feasibility!.developerAdoptionScore) : auto.developerAdoption,
          score: composite10,
          classification: band,
          tool,
          auto: !hasManual,
        });
      }
    });

    // Sort matrix by score descending
    matrix.sort((a, b) => b.score - a.score);

    res.json({
      campaignId,
      totalRespondents,
      registry,
      matrix,
      summary: {
        quickWins,
        strategicBets,
        monitor,
        nonAi,
        totalBlockers: blockers.length,
        scoredBlockers: matrix.length,
        estTimeRecoveredHrs: Math.round(hoursRecovered * 10) / 10,
      },
    });
  } catch (e) {
    next(e);
  }
});
