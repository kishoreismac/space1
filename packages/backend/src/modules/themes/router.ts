import { Router } from 'express';
import { ZodError, z } from 'zod';
import {
  ThemeCreateSchema,
  ThemeTagRequestSchema,
  ThemeUpdateSchema,
} from '@space/shared';
import { config } from '../../config/env.js';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';
import { classifyOpenTextAnswersWithFoundry, FoundryError } from './ai.js';
import { clusterAnswers } from './cluster.js';

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

const ThemeAiAnalyzeSchema = z.object({
  replaceExisting: z.boolean().default(true),
  minimumConfidence: z.number().min(0).max(1).default(0.5),
});

function normalizeText(value: string | null | undefined, maxLen: number): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function statusFromPercentage(percentage: number): 'PROMOTE' | 'INVESTIGATE' | 'MONITOR' {
  if (percentage >= 30) return 'PROMOTE';
  if (percentage >= 15) return 'INVESTIGATE';
  return 'MONITOR';
}

function normalizeThemeName(value: string): string {
  return value.trim().toLowerCase();
}

async function loadPredefinedThemeNames(questionnaireId: string): Promise<Set<string>> {
  const rows = await prisma.question.findMany({
    where: { questionnaireId, NOT: { blockerSignal: null } },
    select: { blockerSignal: true },
  });
  return new Set(
    rows
      .map((r) => normalizeThemeName(r.blockerSignal ?? ''))
      .filter((v) => v.length > 0),
  );
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

// ─── AI analyze open-text answers into themes (Phase 2) ───────────────
themesRouter.post(
  '/ai-analyze',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);

      const foundry = config.foundry;
      if (!foundry.endpoint || !foundry.apiKey || !foundry.deployment) {
        throw new HttpError(
          503,
          'Azure Foundry is not configured. Set AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_API_KEY, and AZURE_FOUNDRY_DEPLOYMENT.',
        );
      }

      const body = ThemeAiAnalyzeSchema.parse(req.body ?? {});
      const campaign = await loadCampaign(companyId, campaignId);

      const openTextAnswers = await prisma.answer.findMany({
        where: {
          submission: { campaignId, status: 'COMPLETED' },
          question: {
            questionnaireId: campaign.questionnaireId,
            questionType: 'OPEN_TEXT',
          },
          NOT: { textValue: null },
        },
        select: {
          id: true,
          textValue: true,
          submissionId: true,
          question: {
            select: {
              id: true,
              questionNumber: true,
            },
          },
        },
      });

      const answerInputs = openTextAnswers
        .map((a) => ({
          answerId: a.id,
          questionNumber: a.question.questionNumber,
          text: (a.textValue ?? '').trim(),
        }))
        .filter((a) => a.text.length > 0);

      if (answerInputs.length === 0) {
        return res.json({
          createdCount: 0,
          tagCount: 0,
          items: [],
          note: 'No open-text answers available for analysis.',
        });
      }

      const questionnaireThemesRaw = await prisma.question.findMany({
        where: {
          questionnaireId: campaign.questionnaireId,
          NOT: { blockerSignal: null },
        },
        select: {
          id: true,
          blockerSignal: true,
        },
      });
      const questionnaireThemes = Array.from(
        new Set(
          questionnaireThemesRaw
            .map((q) => (q.blockerSignal ?? '').trim())
            .filter((s) => s.length > 0),
        ),
      );
      if (questionnaireThemes.length === 0) {
        throw new HttpError(400, 'No predefined questionnaire themes found (blockerSignal).');
      }

      const modelMatches = await classifyOpenTextAnswersWithFoundry(
        {
          endpoint: foundry.endpoint,
          apiKey: foundry.apiKey,
          deployment: foundry.deployment,
          apiVersion: foundry.apiVersion,
        },
        answerInputs,
        questionnaireThemes,
        body.minimumConfidence,
      );

      if (body.replaceExisting) {
        await prisma.openTextThemeTag.deleteMany({ where: { theme: { campaignId } } });
        await prisma.openTextTheme.deleteMany({ where: { campaignId } });
      }

      const signalQuestionMap = new Map<string, string>();
      for (const q of questionnaireThemesRaw) {
        const signal = (q.blockerSignal ?? '').trim();
        if (!signal) continue;
        if (!signalQuestionMap.has(signal)) signalQuestionMap.set(signal, q.id);
      }

      const themeIdByName = new Map<string, string>();
      let createdCount = 0;
      for (const themeName of questionnaireThemes) {
        const existing = await prisma.openTextTheme.findFirst({
          where: { campaignId, themeName },
          select: { id: true },
        });
        if (existing) {
          themeIdByName.set(themeName, existing.id);
          continue;
        }
        const created = await prisma.openTextTheme.create({
          data: {
            campaignId,
            themeName,
            sourceQuestionId: signalQuestionMap.get(themeName) ?? null,
            respondentCount: 0,
            percentage: 0,
            status: 'MONITOR',
          },
        });
        themeIdByName.set(themeName, created.id);
        createdCount += 1;
      }

      let tagCount = 0;
      const touchedThemeIds = new Set<string>();
      for (const m of modelMatches) {
        const themeId = themeIdByName.get(m.matchedThemeName);
        if (!themeId) continue;
        await prisma.openTextThemeTag.upsert({
          where: { themeId_answerId: { themeId, answerId: m.answerId } },
          create: { themeId, answerId: m.answerId },
          update: {},
        });
        tagCount += 1;
        touchedThemeIds.add(themeId);
      }

      for (const themeId of themeIdByName.values()) {
        await recomputeStats(themeId);
      }

      const updatedThemes = await prisma.openTextTheme.findMany({
        where: { campaignId, themeName: { in: questionnaireThemes } },
        select: {
          id: true,
          themeName: true,
          respondentCount: true,
          percentage: true,
          status: true,
        },
      });

      for (const t of updatedThemes) {
        const status = statusFromPercentage(t.percentage);
        if (t.status !== status) {
          await prisma.openTextTheme.update({
            where: { id: t.id },
            data: { status },
          });
          t.status = status;
        }
      }

      const items: Array<{
        id: string;
        themeName: string;
        status: string;
        respondentCount: number;
        percentage: number;
        tagCount: number;
      }> = updatedThemes
        .filter((t) => touchedThemeIds.has(t.id) || t.respondentCount > 0)
        .map((t) => ({
          id: t.id,
          themeName: t.themeName,
          status: t.status,
          respondentCount: t.respondentCount,
          percentage: t.percentage,
          tagCount: t.respondentCount,
        }));

      res.json({
        createdCount,
        tagCount,
        items,
        predefinedThemeCount: questionnaireThemes.length,
      });
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      if (e instanceof FoundryError) return next(new HttpError(e.status, e.message));
      next(e);
    }
  },
);

// ─── Create / update / delete ──────────────────────────────────────────
themesRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const campaign = await loadCampaign(companyId, campaignId);
      const body = ThemeCreateSchema.parse(req.body);
      const allowedThemes = await loadPredefinedThemeNames(campaign.questionnaireId);
      if (!allowedThemes.has(normalizeThemeName(body.themeName))) {
        throw new HttpError(400, 'Theme name must be one of the predefined questionnaire themes');
      }
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
      const campaign = await loadCampaign(companyId, campaignId);
      const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
      if (!theme || theme.campaignId !== campaignId) {
        throw new HttpError(404, 'Theme not found');
      }
      const body = ThemeUpdateSchema.parse(req.body);
      if (body.themeName !== undefined) {
        const allowedThemes = await loadPredefinedThemeNames(campaign.questionnaireId);
        if (!allowedThemes.has(normalizeThemeName(body.themeName))) {
          throw new HttpError(400, 'Theme name must be one of the predefined questionnaire themes');
        }
      }
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

// ─── Theme detail: questions breakdown + respondents ───────────────────
themesRouter.get('/:themeId/detail', async (req, res, next) => {
  try {
    const { companyId, campaignId, themeId } = req.params as {
      companyId: string;
      campaignId: string;
      themeId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const theme = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
    if (!theme || theme.campaignId !== campaignId) throw new HttpError(404, 'Theme not found');

    const tags = await prisma.openTextThemeTag.findMany({
      where: { themeId },
      include: {
        answer: {
          include: {
            question: { select: { id: true, questionNumber: true, questionText: true } },
            submission: { select: { id: true, roleLabel: true, teamId: true } },
          },
        },
      },
    });

    const totalRespondents = await totalCompletedRespondents(campaignId);
    const respondentIds = new Set(tags.map((t) => t.answer.submission.id));

    // Group by question
    const byQuestion = new Map<
      string,
      { questionId: string; questionNumber: number; questionText: string; respondents: Set<string>; answerCount: number }
    >();
    for (const t of tags) {
      const q = t.answer.question;
      let g = byQuestion.get(q.id);
      if (!g) {
        g = { questionId: q.id, questionNumber: q.questionNumber, questionText: q.questionText, respondents: new Set(), answerCount: 0 };
        byQuestion.set(q.id, g);
      }
      g.respondents.add(t.answer.submission.id);
      g.answerCount += 1;
    }

    // Group respondents by role
    const byRole = new Map<string, Set<string>>();
    for (const t of tags) {
      const role = t.answer.submission.roleLabel ?? 'Unattributed';
      let s = byRole.get(role);
      if (!s) { s = new Set(); byRole.set(role, s); }
      s.add(t.answer.submission.id);
    }

    res.json({
      id: theme.id,
      themeName: theme.themeName,
      description: theme.description,
      status: theme.status,
      representativeQuote: theme.representativeQuote,
      jtbdStatement: theme.jtbdStatement,
      respondentCount: respondentIds.size,
      percentage: totalRespondents > 0 ? Math.round((respondentIds.size / totalRespondents) * 1000) / 10 : 0,
      tagCount: tags.length,
      totalRespondents,
      questions: [...byQuestion.values()]
        .map((g) => ({
          questionId: g.questionId,
          questionNumber: g.questionNumber,
          questionText: g.questionText,
          respondentCount: g.respondents.size,
          answerCount: g.answerCount,
          percentage: totalRespondents > 0 ? Math.round((g.respondents.size / totalRespondents) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.respondentCount - a.respondentCount),
      roles: [...byRole.entries()]
        .map(([role, set]) => ({
          roleLabel: role,
          respondentCount: set.size,
          percentage: totalRespondents > 0 ? Math.round((set.size / totalRespondents) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.respondentCount - a.respondentCount),
    });
  } catch (e) { next(e); }
});

// ─── Auto-generate themes from open-text answers ───────────────────────
themesRouter.post(
  '/auto-generate',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const campaign = await loadCampaign(companyId, campaignId);

      const replace = req.body?.replace === true;
      const minSize = typeof req.body?.minSize === 'number' ? Math.max(2, req.body.minSize) : 2;

      // Pull every completed open-text answer for this campaign
      const answers = await prisma.answer.findMany({
        where: {
          submission: { campaignId, status: 'COMPLETED' },
          question: {
            questionnaireId: campaign.questionnaireId,
            questionType: 'OPEN_TEXT',
          },
          NOT: { textValue: null },
        },
        select: { id: true, textValue: true },
      });
      const inputs = answers
        .filter((a) => (a.textValue ?? '').trim().length > 0)
        .map((a) => ({ id: a.id, text: a.textValue as string }));

      if (inputs.length === 0) {
        return res.json({ created: 0, updated: 0, totalTagged: 0, themes: [] });
      }

      const clusters = clusterAnswers(inputs, { minSize });

      // Optionally wipe existing themes (only those without manual edits we don't track —
      // we treat replace=true as full reset for simplicity).
      if (replace) {
        await prisma.openTextTheme.deleteMany({ where: { campaignId } });
      }

      const totalRespondents = await totalCompletedRespondents(campaignId);
      let created = 0;
      let updated = 0;
      let totalTagged = 0;
      const summaryThemes: Array<{ id: string; themeName: string; respondentCount: number; percentage: number; status: string }> = [];

      for (const cluster of clusters) {
        // Reuse a theme with the same name if present (so re-runs are idempotent)
        const existing = await prisma.openTextTheme.findFirst({
          where: { campaignId, themeName: cluster.themeName },
        });

        let theme;
        if (existing) {
          theme = await prisma.openTextTheme.update({
            where: { id: existing.id },
            data: {
              description: existing.description ?? cluster.description,
              jtbdStatement: existing.jtbdStatement ?? cluster.jtbdStatement,
              representativeQuote: existing.representativeQuote ?? cluster.representativeQuote,
            },
          });
          updated += 1;
        } else {
          theme = await prisma.openTextTheme.create({
            data: {
              campaignId,
              themeName: cluster.themeName,
              description: cluster.description,
              jtbdStatement: cluster.jtbdStatement,
              representativeQuote: cluster.representativeQuote,
              status: 'MONITOR',
            },
          });
          created += 1;
        }

        // Tag answers (upsert to avoid duplicates)
        for (const answerId of cluster.answerIds) {
          await prisma.openTextThemeTag.upsert({
            where: { themeId_answerId: { themeId: theme.id, answerId } },
            create: { themeId: theme.id, answerId },
            update: {},
          });
          totalTagged += 1;
        }

        // Recompute stats + apply 30%/15% rule for status
        await recomputeStats(theme.id);
        const refreshed = await prisma.openTextTheme.findUnique({ where: { id: theme.id } });
        if (refreshed) {
          let newStatus: 'PROMOTE' | 'INVESTIGATE' | 'MONITOR' = 'MONITOR';
          if (refreshed.percentage >= 30) newStatus = 'PROMOTE';
          else if (refreshed.percentage >= 15) newStatus = 'INVESTIGATE';
          if (refreshed.status !== newStatus) {
            await prisma.openTextTheme.update({
              where: { id: refreshed.id },
              data: { status: newStatus },
            });
          }
          summaryThemes.push({
            id: refreshed.id,
            themeName: refreshed.themeName,
            respondentCount: refreshed.respondentCount,
            percentage: refreshed.percentage,
            status: newStatus,
          });
        }
      }

      recordAudit(req, 'themes.autoGenerate', 'OpenTextTheme', campaignId, {
        created, updated, totalTagged, clusters: clusters.length, totalRespondents,
      });

      res.json({ created, updated, totalTagged, totalRespondents, themes: summaryThemes });
    } catch (e) { next(e); }
  },
);

