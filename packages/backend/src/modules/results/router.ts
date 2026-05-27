import { Router } from 'express';
import {
  applyTrendOverride,
  crossPatternAlerts,
  questionAverage,
  scoreCampaign,
  type DimensionCode,
  type DimensionScore,
  type QuestionDef,
  type RawAnswer,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const resultsRouter = Router({ mergeParams: true });
resultsRouter.use(requireAuth);

interface LoadedCampaign {
  id: string;
  companyId: string;
  questionnaireId: string;
  previousS: number | null;
  previousP: number | null;
  previousA: number | null;
  previousC: number | null;
  previousE: number | null;
}

async function loadCampaign(companyId: string, campaignId: string): Promise<LoadedCampaign> {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

async function loadQuestionnaireDefs(questionnaireId: string): Promise<QuestionDef[]> {
  const questions = await prisma.question.findMany({
    where: { questionnaireId },
    include: { dimension: true },
    orderBy: { questionNumber: 'asc' },
  });
  return questions.map((q) => ({
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
}

async function loadSubmissionAnswers(
  campaignId: string,
  filter?: { teamId?: string | null },
): Promise<{ submissions: RawAnswer[][]; count: number }> {
  // Explicit-null teamId → only rows with teamId IS NULL.
  // Non-empty string → that team only.
  // undefined / missing → no team filter.
  const teamFilter =
    filter && 'teamId' in filter
      ? filter.teamId === null
        ? { teamId: null }
        : filter.teamId
          ? { teamId: filter.teamId }
          : {}
      : {};
  const submissions = await prisma.submission.findMany({
    where: {
      campaignId,
      status: 'COMPLETED',
      ...teamFilter,
    },
    include: {
      answers: { include: { question: { select: { questionNumber: true } } } },
    },
  });
  const out: RawAnswer[][] = submissions.map((s) =>
    s.answers.map((a) => ({
      questionNumber: a.question.questionNumber,
      rawValue: a.numericValue ?? null,
      textValue: a.textValue,
    })),
  );
  return { submissions: out, count: submissions.length };
}

function previousAvgFor(c: LoadedCampaign, code: DimensionCode): number | null {
  switch (code) {
    case 'S': return c.previousS;
    case 'P': return c.previousP;
    case 'A': return c.previousA;
    case 'C': return c.previousC;
    case 'E': return c.previousE;
    default: return null;
  }
}

// ─── GET overview ──────────────────────────────────────────────────────
resultsRouter.get('/', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const campaign = await loadCampaign(companyId, campaignId);
    const teamId = (req.query.teamId as string | undefined) ?? undefined;

    const questions = await loadQuestionnaireDefs(campaign.questionnaireId);
    const { submissions, count } = await loadSubmissionAnswers(campaignId, { teamId });

    const dims = scoreCampaign(questions, submissions);

    // Apply trend overrides + compute trend delta vs prior cycle.
    const enriched = dims.map((d) => {
      const prev = previousAvgFor(campaign, d.code);
      const { priority, overridden } = applyTrendOverride(d.band, d.averageScore, prev);
      const trendDelta =
        d.averageScore !== null && prev !== null
          ? Math.round((d.averageScore - prev) * 100) / 100
          : null;
      return {
        ...d,
        priority,
        trendOverridden: overridden,
        previousAverage: prev,
        trendDelta,
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

    res.json({
      campaignId,
      teamId: teamId ?? null,
      respondentCount: count,
      inviteCount,
      responseRate,
      psychSafetyAverage,
      dimensions: enriched,
      alerts,
    });
  } catch (e) { next(e); }
});

// ─── GET question breakdown ────────────────────────────────────────────
resultsRouter.get('/questions', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const campaign = await loadCampaign(companyId, campaignId);
    const teamId = (req.query.teamId as string | undefined) ?? undefined;

    const questions = await loadQuestionnaireDefs(campaign.questionnaireId);
    const { submissions } = await loadSubmissionAnswers(campaignId, { teamId });

    const breakdown = questions
      .filter((q) => q.type === 'LIKERT')
      .map((q) => {
        const { average, responseCount } = questionAverage(q, submissions);
        return {
          questionNumber: q.number,
          dimensionCode: q.dimensionCode,
          text: q.text,
          isReverseScored: q.isReverseScored,
          blockerSignal: q.blockerSignal ?? null,
          average,
          responseCount,
        };
      });

    res.json({ items: breakdown });
  } catch (e) { next(e); }
});

// ─── GET per-team comparison ───────────────────────────────────────────
// Scores each team independently + an "All teams" + "Unassigned" row.
// Flags dimensions where a team's average diverges from the campaign
// average by more than ±0.5 (configurable via ?threshold=).
resultsRouter.get('/teams', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const campaign = await loadCampaign(companyId, campaignId);
    const threshold = Math.max(
      0,
      Math.min(5, Number(req.query.threshold ?? 0.5) || 0.5),
    );

    const questions = await loadQuestionnaireDefs(campaign.questionnaireId);
    const teams = await prisma.team.findMany({
      where: { companyId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });

    // Campaign-wide baseline first.
    const overall = await loadSubmissionAnswers(campaignId);
    const overallDims = scoreCampaign(questions, overall.submissions);
    const overallByCode = Object.fromEntries(
      overallDims.map((d) => [d.code, d.averageScore]),
    ) as Record<DimensionCode, number | null>;

    // Unassigned bucket = submissions with teamId === null
    const allRaw = await prisma.submission.findMany({
      where: { campaignId, status: 'COMPLETED' },
      select: { id: true, teamId: true },
    });
    const unassignedCount = allRaw.filter((s) => s.teamId === null).length;

    interface TeamRow {
      teamId: string | null;
      teamName: string;
      respondentCount: number;
      dimensions: Array<{
        code: DimensionCode;
        averageScore: number | null;
        responseCount: number;
        band: string;
        delta: number | null;
        flagged: boolean;
      }>;
    }

    const rows: TeamRow[] = [];

    // All-teams row first (for reference)
    rows.push({
      teamId: null,
      teamName: 'All teams (campaign avg)',
      respondentCount: overall.count,
      dimensions: overallDims.map((d) => ({
        code: d.code,
        averageScore: d.averageScore,
        responseCount: d.responseCount,
        band: d.band,
        delta: null,
        flagged: false,
      })),
    });

    for (const t of teams) {
      const { submissions, count } = await loadSubmissionAnswers(campaignId, {
        teamId: t.id,
      });
      if (count === 0) continue;
      const dims = scoreCampaign(questions, submissions);
      rows.push({
        teamId: t.id,
        teamName: t.name,
        respondentCount: count,
        dimensions: dims.map((d) => {
          const base = overallByCode[d.code];
          const delta =
            d.averageScore !== null && base !== null
              ? Math.round((d.averageScore - base) * 100) / 100
              : null;
          return {
            code: d.code,
            averageScore: d.averageScore,
            responseCount: d.responseCount,
            band: d.band,
            delta,
            flagged: delta !== null && Math.abs(delta) >= threshold,
          };
        }),
      });
    }

    if (unassignedCount > 0) {
      const { submissions, count } = await loadSubmissionAnswers(campaignId, {
        teamId: null,
      });
      const dims = scoreCampaign(questions, submissions);
      rows.push({
        teamId: null,
        teamName: 'Unassigned',
        respondentCount: count,
        dimensions: dims.map((d) => {
          const base = overallByCode[d.code];
          const delta =
            d.averageScore !== null && base !== null
              ? Math.round((d.averageScore - base) * 100) / 100
              : null;
          return {
            code: d.code,
            averageScore: d.averageScore,
            responseCount: d.responseCount,
            band: d.band,
            delta,
            flagged: delta !== null && Math.abs(delta) >= threshold,
          };
        }),
      });
    }

    res.json({
      campaignId,
      threshold,
      teamRows: rows,
      totalRespondents: overall.count,
      unassignedCount,
    });
  } catch (e) { next(e); }
});

// ─── GET open-text answers ─────────────────────────────────────────────
resultsRouter.get('/open-text', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const campaign = await loadCampaign(companyId, campaignId);

    const items = await prisma.answer.findMany({
      where: {
        submission: { campaignId, status: 'COMPLETED' },
        question: { questionnaireId: campaign.questionnaireId, questionType: 'OPEN_TEXT' },
        NOT: { textValue: null },
      },
      include: {
        question: { select: { questionNumber: true, questionText: true } },
        submission: { select: { roleLabel: true, teamId: true } },
      },
      orderBy: { id: 'desc' },
    });

    res.json({
      items: items
        .filter((a) => (a.textValue ?? '').trim().length > 0)
        .map((a) => ({
          questionNumber: a.question.questionNumber,
          questionText: a.question.questionText,
          text: a.textValue,
          roleLabel: a.submission.roleLabel,
          teamId: a.submission.teamId,
        })),
    });
  } catch (e) { next(e); }
});

// ─── POST persist score summary snapshot ───────────────────────────────
resultsRouter.post(
  '/snapshot',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const campaign = await loadCampaign(companyId, campaignId);
      const questions = await loadQuestionnaireDefs(campaign.questionnaireId);
      const { submissions } = await loadSubmissionAnswers(campaignId);
      const dims = scoreCampaign(questions, submissions);

      const now = new Date();
      for (const d of dims) {
        const prev = previousAvgFor(campaign, d.code);
        const { priority, overridden } = applyTrendOverride(d.band, d.averageScore, prev);
        const trendDelta =
          d.averageScore !== null && prev !== null
            ? Math.round((d.averageScore - prev) * 100) / 100
            : null;
        await prisma.scoreSummary.upsert({
          where: {
            campaignId_dimensionCode: { campaignId, dimensionCode: d.code },
          },
          create: {
            campaignId,
            dimensionCode: d.code,
            dimensionName: d.name,
            averageScore: d.averageScore,
            responseCount: d.responseCount,
            scoreBand: d.band,
            priorityLevel: priority,
            trendDelta,
            trendOverridden: overridden,
            computedAt: now,
          },
          update: {
            dimensionName: d.name,
            averageScore: d.averageScore,
            responseCount: d.responseCount,
            scoreBand: d.band,
            priorityLevel: priority,
            trendDelta,
            trendOverridden: overridden,
            computedAt: now,
          },
        });
      }

      const summaries = await prisma.scoreSummary.findMany({
        where: { campaignId },
        orderBy: { dimensionCode: 'asc' },
      });
      res.json({ snapshotAt: now.toISOString(), summaries });
    } catch (e) { next(e); }
  },
);
