import { Router } from 'express';
import {
  applyTrendOverride,
  crossPatternAlerts,
  scoreCampaign,
  type DimensionCode,
  type DimensionScore,
  type QuestionDef,
  type RawAnswer,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth } from '../auth/middleware.js';
import { trySaveArtifact } from '../../lib/storage.js';

export const reportRouter = Router({ mergeParams: true });
reportRouter.use(requireAuth);

const SEVERITY_IMPACT: Record<string, number> = { P1: 5, P2: 4, P3: 3, P4: 2 };
const SEVERITY_ORDER: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
const DIMENSION_NAMES: Record<DimensionCode, string> = {
  S: 'Satisfaction & Well-being',
  P: 'Performance',
  A: 'Activity',
  C: 'Communication & Collaboration',
  E: 'Efficiency & Flow',
};

function phase2BlockerWhere(campaignId: string) {
  return {
    campaignId,
    NOT: {
      OR: [
        { evidenceSummary: { startsWith: 'Cross-dimension metric evidence:' } },
        {
          AND: [
            { title: { startsWith: 'Low ' } },
            { evidenceSummary: { contains: 'survey mean' } },
          ],
        },
      ],
    },
  };
}

function previousAvgFor(
  c: { previousS: number | null; previousP: number | null; previousA: number | null; previousC: number | null; previousE: number | null },
  code: DimensionCode,
): number | null {
  switch (code) {
    case 'S': return c.previousS;
    case 'P': return c.previousP;
    case 'A': return c.previousA;
    case 'C': return c.previousC;
    case 'E': return c.previousE;
    default: return null;
  }
}

reportRouter.get('/', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);

    const campaign = await prisma.surveyCampaign.findUnique({
      where: { id: campaignId },
      include: {
        company: { select: { id: true, name: true } },
        questionnaire: { select: { id: true, title: true, version: true } },
      },
    });
    if (!campaign || campaign.companyId !== companyId) {
      throw new HttpError(404, 'Campaign not found');
    }

    // ── SPACE scores ─────────────────────────────────────────────────
    const questionRows = await prisma.question.findMany({
      where: { questionnaireId: campaign.questionnaireId },
      include: { dimension: true },
      orderBy: { questionNumber: 'asc' },
    });
    const questions: QuestionDef[] = questionRows.map((q) => ({
      number: q.questionNumber,
      dimensionCode: q.dimension.code as DimensionCode,
      text: q.questionText,
      type: q.questionType as QuestionDef['type'],
      isReverseScored: q.isReverseScored,
      isRequired: q.isRequired,
      minScale: q.minScale ?? undefined,
      maxScale: q.maxScale ?? undefined,
      lowLabel: q.lowLabel ?? undefined,
      highLabel: q.highLabel ?? undefined,
      blockerSignal: q.blockerSignal ?? undefined,
    }));

    const subs = await prisma.submission.findMany({
      where: { campaignId, status: 'COMPLETED' },
      include: {
        answers: { include: { question: { select: { questionNumber: true } } } },
      },
    });
    const submissions: RawAnswer[][] = subs.map((s) =>
      s.answers.map((a) => ({
        questionNumber: a.question.questionNumber,
        rawValue: a.numericValue ?? null,
        textValue: a.textValue,
      })),
    );

    const dims = scoreCampaign(questions, submissions);
    const dimensions = dims.map((d) => {
      const prev = previousAvgFor(campaign, d.code);
      const { priority, overridden } = applyTrendOverride(d.band, d.averageScore, prev);
      const trendDelta =
        d.averageScore !== null && prev !== null
          ? Math.round((d.averageScore - prev) * 100) / 100
          : null;
      return {
        code: d.code,
        name: DIMENSION_NAMES[d.code],
        averageScore: d.averageScore,
        band: d.band,
        priority,
        previousAverage: prev,
        trendDelta,
        trendOverridden: overridden,
      };
    });

    // Psych-safety gate (Q7).
    const q7Values: number[] = [];
    for (const s of submissions) {
      const a = s.find((x) => x.questionNumber === 7);
      if (a?.rawValue != null) q7Values.push(a.rawValue);
    }
    const psychSafetyAverage = q7Values.length
      ? Math.round((q7Values.reduce((a, b) => a + b, 0) / q7Values.length) * 100) / 100
      : null;

    const byCode = Object.fromEntries(dims.map((d) => [d.code, d])) as Record<
      DimensionCode,
      DimensionScore
    >;
    const alerts = crossPatternAlerts(byCode, psychSafetyAverage);

    const [inviteCount, completedInvites] = await Promise.all([
      prisma.surveyInvite.count({ where: { campaignId } }),
      prisma.surveyInvite.count({ where: { campaignId, status: 'COMPLETED' } }),
    ]);
    const responseRate = inviteCount
      ? Math.round((completedInvites / inviteCount) * 1000) / 10
      : null;

    // ── Themes ───────────────────────────────────────────────────────
    const themes = await prisma.openTextTheme.findMany({
      where: { campaignId, NOT: { sourceType: 'Cross-Dimension Metric' } },
      orderBy: [{ status: 'asc' }, { respondentCount: 'desc' }],
    });

    // ── Journey ──────────────────────────────────────────────────────
    const sessions = await prisma.journeyMapSession.findMany({
      where: { campaignId },
      include: {
        team: { select: { name: true } },
        steps: true,
      },
    });
    const allSteps = sessions.flatMap((s) => s.steps);
    const frictionCounts = { RED: 0, YELLOW: 0, GREEN: 0 };
    for (const st of allSteps) {
      if (st.frictionLevel === 'RED') frictionCounts.RED += 1;
      else if (st.frictionLevel === 'YELLOW') frictionCounts.YELLOW += 1;
      else frictionCounts.GREEN += 1;
    }
    const topFrictionSteps = allSteps
      .filter((s) => s.frictionLevel === 'RED')
      .sort((a, b) => b.dotVotes - a.dotVotes)
      .slice(0, 10)
      .map((s) => ({
        stepName: s.stepName,
        rootCause: s.rootCause,
        jtbdStatement: s.jtbdStatement,
        dotVotes: s.dotVotes,
        quote: s.quote,
      }));

    // ── Blockers + Roadmap ───────────────────────────────────────────
    const blockerRows = await prisma.blocker.findMany({
      where: phase2BlockerWhere(campaignId),
      include: { feasibility: true, _count: { select: { signals: true } } },
    });
    blockerRows.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );

    const rmRows = blockerRows.map((b) => {
      const sevImpact = SEVERITY_IMPACT[b.severity] ?? 3;
      const reachImpact = b.reachPercentage ? (b.reachPercentage / 100) * 5 : 0;
      const hoursImpact = Math.min((b.estimatedHoursLost ?? 0) / 8, 5);
      const impactScore =
        Math.round(((sevImpact + reachImpact + hoursImpact) / 3) * 100) / 100;
      const feasibility = b.feasibility?.weightedCompositeScore ?? 0;
      const priorityScore = Math.round(impactScore * feasibility * 100) / 100;
      return {
        blockerId: b.id,
        title: b.title,
        severity: b.severity,
        sdlcPhase: b.sdlcPhase,
        dimensionCode: b.dimensionCode,
        reachPercentage: b.reachPercentage,
        estimatedHoursLost: b.estimatedHoursLost,
        evidenceSummary: b.evidenceSummary,
        signalCount: b._count.signals,
        aiFit: b.aiFit,
        status: b.status,
        feasibilityScore: feasibility,
        feasibilityClass: b.feasibility?.classification ?? null,
        impactScore,
        priorityScore,
      };
    });
    const eligible = rmRows.filter(
      (r) => r.status !== 'DROPPED' && r.feasibilityClass !== 'NOT_FIT',
    );
    eligible.sort((a, b) => b.priorityScore - a.priorityScore);
    const now: typeof eligible = [];
    const nextB: typeof eligible = [];
    const later: typeof eligible = [];
    for (const r of eligible) {
      if (r.feasibilityClass === 'STRONG_FIT' && r.priorityScore > 0) now.push(r);
      else if (
        r.feasibilityClass === 'CANDIDATE' ||
        (r.feasibilityClass === null && r.priorityScore === 0)
      ) nextB.push(r);
      else later.push(r);
    }
    const excluded = rmRows.filter(
      (r) => r.status === 'DROPPED' || r.feasibilityClass === 'NOT_FIT',
    );

    // ── Recommendations: top 3 priority items in Now, Next, Later
    const recommendations = {
      now: now.slice(0, 3),
      next: nextB.slice(0, 3),
      later: later.slice(0, 3),
    };

    res.json({
      generatedAt: new Date().toISOString(),
      company: campaign.company,
      campaign: {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.closeDate,
        questionnaire: campaign.questionnaire,
      },
      participation: {
        respondentCount: submissions.length,
        inviteCount,
        completedInvites,
        responseRate,
      },
      space: {
        dimensions,
        psychSafetyAverage,
        psychSafetyGate:
          psychSafetyAverage === null
            ? 'NA'
            : psychSafetyAverage < 3
              ? 'BLOCKED'
              : 'OK',
        alerts,
      },
      themes: themes.map((t) => ({
        id: t.id,
        themeName: t.themeName,
        status: t.status,
        sourceType: t.sourceType,
        respondentCount: t.respondentCount,
        percentage: t.percentage,
        jtbdStatement: t.jtbdStatement,
        representativeQuote: t.representativeQuote,
      })),
      journey: {
        sessionCount: sessions.length,
        stepCount: allSteps.length,
        frictionCounts,
        topFrictionSteps,
      },
      blockers: rmRows,
      roadmap: {
        now,
        next: nextB,
        later,
        excluded,
        summary: {
          total: rmRows.length,
          scored: rmRows.filter((r) => r.feasibilityScore > 0).length,
          unscored: rmRows.filter((r) => r.feasibilityScore === 0).length,
        },
      },
      recommendations,
    });
  } catch (e) {
    next(e);
  }
});

// POST /save — build the report payload and persist it to Azure Blob (reports/)
reportRouter.post('/save', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    // Re-use the GET handler by issuing an internal fetch via the express router is awkward;
    // simplest: tell the client to GET / then POST it back here as `body.report`.
    // Body shape: { report: <whatever the GET / endpoint returned> }
    const report = (req.body && (req.body as Record<string, unknown>).report) ?? req.body;
    if (!report || typeof report !== 'object') {
      throw new HttpError(400, 'Body must contain a "report" object (the rendered report payload).');
    }
    const meta = await trySaveArtifact('reports', companyId, campaignId, {
      savedBy: req.auth?.sub ?? null,
      savedAt: new Date().toISOString(),
      report,
    });
    res.status(201).json(meta ?? { saved: false, reason: 'storage_not_configured' });
  } catch (e) {
    next(e);
  }
});
