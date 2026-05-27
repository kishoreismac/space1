import { Router } from 'express';
import { ZodError } from 'zod';
import {
  ThemeCreateSchema,
  ThemeTagRequestSchema,
  ThemeUpdateSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const themesRouter = Router({ mergeParams: true });
themesRouter.use(requireAuth);

function handleZod(err: ZodError): HttpError {
  return new HttpError(400, 'Invalid request body', err.issues);
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
}

async function totalCompletedRespondents(campaignId: string): Promise<number> {
  return prisma.submission.count({ where: { campaignId, status: 'COMPLETED' } });
}

/** Recompute respondentCount/percentage for a theme using its current tags. */
async function recomputeStats(themeId: string): Promise<void> {
  const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
  if (!theme) return;
  const tags = await prisma.openTextThemeTag.findMany({
    where: { themeId },
    include: { answer: { select: { submissionId: true } } },
  });
  const uniqueSubmissions = new Set(tags.map((t) => t.answer.submissionId));
  const respondentCount = uniqueSubmissions.size;
  const total = await totalCompletedRespondents(theme.campaignId);
  const percentage =
    total > 0 ? Math.round((respondentCount / total) * 1000) / 10 : 0;
  await prisma.openTextTheme.update({
    where: { id: themeId },
    data: { respondentCount, percentage },
  });
}

// ─── List + tagged answers ─────────────────────────────────────────────
themesRouter.get('/', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const items = await prisma.openTextTheme.findMany({
      where: { campaignId },
      orderBy: [{ status: 'asc' }, { respondentCount: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { tags: true } },
      },
    });
    res.json({
      items: items.map((t) => ({
        id: t.id,
        campaignId: t.campaignId,
        themeName: t.themeName,
        description: t.description,
        sourceQuestionId: t.sourceQuestionId,
        representativeQuote: t.representativeQuote,
        jtbdStatement: t.jtbdStatement,
        status: t.status,
        respondentCount: t.respondentCount,
        percentage: t.percentage,
        tagCount: t._count.tags,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (e) { next(e); }
});

themesRouter.get('/:themeId/tags', async (req, res, next) => {
  try {
    const { companyId, campaignId, themeId } = req.params as {
      companyId: string;
      campaignId: string;
      themeId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const tags = await prisma.openTextThemeTag.findMany({
      where: { themeId, theme: { campaignId } },
      include: {
        answer: {
          include: {
            question: { select: { questionNumber: true, questionText: true } },
            submission: { select: { roleLabel: true, teamId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: tags.map((t) => ({
        id: t.id,
        answerId: t.answerId,
        text: t.answer.textValue,
        questionNumber: t.answer.question.questionNumber,
        questionText: t.answer.question.questionText,
        roleLabel: t.answer.submission.roleLabel,
        teamId: t.answer.submission.teamId,
      })),
    });
  } catch (e) { next(e); }
});

// ─── Create / update / delete ──────────────────────────────────────────
themesRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);
      const body = ThemeCreateSchema.parse(req.body);
      const created = await prisma.openTextTheme.create({
        data: {
          campaignId,
          themeName: body.themeName,
          description: body.description ?? null,
          sourceQuestionId: body.sourceQuestionId ?? null,
          representativeQuote: body.representativeQuote ?? null,
          jtbdStatement: body.jtbdStatement ?? null,
          status: body.status ?? 'MONITOR',
        },
      });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e)); next(e);
    }
  },
);

themesRouter.patch(
  '/:themeId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, themeId } = req.params as {
        companyId: string;
        campaignId: string;
        themeId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
      if (!theme || theme.campaignId !== campaignId) {
        throw new HttpError(404, 'Theme not found');
      }
      const body = ThemeUpdateSchema.parse(req.body);
      const updated = await prisma.openTextTheme.update({
        where: { id: themeId },
        data: {
          ...(body.themeName !== undefined ? { themeName: body.themeName } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.sourceQuestionId !== undefined
            ? { sourceQuestionId: body.sourceQuestionId }
            : {}),
          ...(body.representativeQuote !== undefined
            ? { representativeQuote: body.representativeQuote }
            : {}),
          ...(body.jtbdStatement !== undefined ? { jtbdStatement: body.jtbdStatement } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e)); next(e);
    }
  },
);

themesRouter.delete(
  '/:themeId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, themeId } = req.params as {
        companyId: string;
        campaignId: string;
        themeId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
      if (!theme || theme.campaignId !== campaignId) {
        throw new HttpError(404, 'Theme not found');
      }
      await prisma.openTextTheme.delete({ where: { id: themeId } });
      res.status(204).end();
    } catch (e) { next(e); }
  },
);

// ─── Tagging answers to themes ─────────────────────────────────────────
themesRouter.post(
  '/:themeId/tags',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, themeId } = req.params as {
        companyId: string;
        campaignId: string;
        themeId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
      if (!theme || theme.campaignId !== campaignId) {
        throw new HttpError(404, 'Theme not found');
      }
      const body = ThemeTagRequestSchema.parse(req.body);

      const answer = await prisma.answer.findUnique({
        where: { id: body.answerId },
        include: { submission: { select: { campaignId: true } } },
      });
      if (!answer || answer.submission.campaignId !== campaignId) {
        throw new HttpError(404, 'Answer not found in this campaign');
      }
      if (!answer.textValue || answer.textValue.trim().length === 0) {
        throw new HttpError(400, 'Cannot tag an empty answer');
      }

      await prisma.openTextThemeTag.upsert({
        where: { themeId_answerId: { themeId, answerId: body.answerId } },
        create: { themeId, answerId: body.answerId },
        update: {},
      });
      await recomputeStats(themeId);
      res.status(201).json({ ok: true });
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e)); next(e);
    }
  },
);

themesRouter.delete(
  '/:themeId/tags/:answerId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, themeId, answerId } = req.params as {
        companyId: string;
        campaignId: string;
        themeId: string;
        answerId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
      if (!theme || theme.campaignId !== campaignId) {
        throw new HttpError(404, 'Theme not found');
      }
      await prisma.openTextThemeTag
        .delete({ where: { themeId_answerId: { themeId, answerId } } })
        .catch(() => undefined);
      await recomputeStats(themeId);
      res.status(204).end();
    } catch (e) { next(e); }
  },
);

// ─── Untagged answers (for the tagging UI) ─────────────────────────────
themesRouter.get('/untagged-answers', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    const campaign = await loadCampaign(companyId, campaignId);
    const themeId = (req.query.excludeTaggedBy as string | undefined) ?? undefined;
    const questionNumber = req.query.questionNumber
      ? Number(req.query.questionNumber)
      : undefined;

    const answers = await prisma.answer.findMany({
      where: {
        submission: { campaignId, status: 'COMPLETED' },
        question: {
          questionnaireId: campaign.questionnaireId,
          questionType: 'OPEN_TEXT',
          ...(questionNumber ? { questionNumber } : {}),
        },
        NOT: { textValue: null },
        ...(themeId
          ? { themeTags: { none: { themeId } } }
          : {}),
      },
      include: {
        question: { select: { questionNumber: true, questionText: true } },
        submission: { select: { roleLabel: true, teamId: true } },
        themeTags: {
          include: { theme: { select: { id: true, themeName: true, status: true } } },
        },
      },
      orderBy: { id: 'desc' },
      take: 500,
    });

    res.json({
      items: answers
        .filter((a) => (a.textValue ?? '').trim().length > 0)
        .map((a) => ({
          answerId: a.id,
          text: a.textValue,
          questionNumber: a.question.questionNumber,
          questionText: a.question.questionText,
          roleLabel: a.submission.roleLabel,
          teamId: a.submission.teamId,
          themes: a.themeTags.map((t) => ({
            id: t.theme.id,
            themeName: t.theme.themeName,
            status: t.theme.status,
          })),
        })),
    });
  } catch (e) { next(e); }
});
