import { Router } from 'express';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../middleware/error.js';
import { assertCompanyAccess, requireAuth } from '../auth/middleware.js';

export const exportRouter = Router({ mergeParams: true });
exportRouter.use(requireAuth);

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return lines.join('\r\n') + '\r\n';
}

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

function sendCsv(res: import('express').Response, filename: string, body: string) {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

// ─── /export/answers.csv — long format, one row per answer ─────────────
exportRouter.get('/answers.csv', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const answers = await prisma.answer.findMany({
      where: { submission: { campaignId, status: 'COMPLETED' } },
      include: {
        question: {
          select: { questionNumber: true, questionText: true, questionType: true },
        },
        submission: {
          select: { id: true, roleLabel: true, teamId: true, submittedAt: true },
        },
      },
    });
    const rows = answers.map((a) => [
      a.submission.id,
      a.submission.submittedAt?.toISOString() ?? '',
      a.submission.teamId ?? '',
      a.submission.roleLabel ?? '',
      a.question.questionNumber,
      a.question.questionType,
      a.question.questionText,
      a.numericValue ?? '',
      a.textValue ?? '',
    ]);
    sendCsv(
      res,
      `campaign-${campaignId}-answers.csv`,
      toCsv(
        ['submissionId', 'submittedAt', 'teamId', 'roleLabel', 'qNum', 'qType', 'qText', 'numericValue', 'textValue'],
        rows,
      ),
    );
  } catch (e) { next(e); }
});

// ─── /export/blockers.csv ──────────────────────────────────────────────
exportRouter.get('/blockers.csv', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const blockers = await prisma.blocker.findMany({
      where: phase2BlockerWhere(campaignId),
      include: { feasibility: true, _count: { select: { signals: true } } },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
    const rows = blockers.map((b) => [
      b.id,
      b.title,
      b.severity,
      b.sdlcPhase ?? '',
      b.dimensionCode ?? '',
      b.affectedTeams ?? '',
      b.reachPercentage ?? '',
      b.estimatedHoursLost ?? '',
      b.aiFit,
      b.status,
      b._count.signals,
      b.feasibility?.weightedCompositeScore ?? '',
      b.feasibility?.classification ?? '',
      b.evidenceSummary ?? '',
    ]);
    sendCsv(
      res,
      `campaign-${campaignId}-blockers.csv`,
      toCsv(
        ['id', 'title', 'severity', 'sdlcPhase', 'dimension', 'affectedTeams', 'reachPct', 'hoursLost', 'aiFit', 'status', 'signalCount', 'feasibilityScore', 'feasibilityClass', 'evidenceSummary'],
        rows,
      ),
    );
  } catch (e) { next(e); }
});

// ─── /export/themes.csv ────────────────────────────────────────────────
exportRouter.get('/themes.csv', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const themes = await prisma.openTextTheme.findMany({
      where: { campaignId, NOT: { sourceType: 'Cross-Dimension Metric' } },
      include: { _count: { select: { tags: true } } },
      orderBy: [{ status: 'asc' }, { respondentCount: 'desc' }],
    });
    const rows = themes.map((t) => [
      t.id,
      t.themeName,
      t.status,
      t.sourceType ?? '',
      t.respondentCount,
      t.percentage,
      t._count.tags,
      t.jtbdStatement ?? '',
      t.representativeQuote ?? '',
      t.description ?? '',
    ]);
    sendCsv(
      res,
      `campaign-${campaignId}-themes.csv`,
      toCsv(
        ['id', 'themeName', 'status', 'source', 'respondentCount', 'percentage', 'tagCount', 'jtbd', 'representativeQuote', 'description'],
        rows,
      ),
    );
  } catch (e) { next(e); }
});
