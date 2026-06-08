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
import { trySaveArtifact } from '../../lib/storage.js';

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

function sourceTypeForQuestion(questionType: string | null | undefined): 'Numeric Question' | 'Text Question' {
  return questionType === 'OPEN_TEXT' ? 'Text Question' : 'Numeric Question';
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

async function recomputeStatsAndStatus(themeId: string): Promise<void> {
  await recomputeStats(themeId);
  const refreshed = await prisma.openTextTheme.findUnique({ where: { id: themeId } });
  if (!refreshed) return;
  const status = statusFromPercentage(refreshed.percentage);
  if (refreshed.status !== status) {
    await prisma.openTextTheme.update({ where: { id: themeId }, data: { status } });
  }
}

async function upsertGeneratedTheme(input: {
  campaignId: string;
  themeName: string;
  description?: string | null;
  sourceQuestionId?: string | null;
  sourceType?: string | null;
  representativeQuote?: string | null;
  jtbdStatement?: string | null;
}): Promise<{ id: string; created: boolean; updated: boolean }> {
  const existing = await prisma.openTextTheme.findFirst({
    where: { campaignId: input.campaignId, themeName: input.themeName },
  });
  if (existing) {
    const updated = await prisma.openTextTheme.update({
      where: { id: existing.id },
      data: {
        description: existing.description ?? input.description ?? null,
        sourceQuestionId: existing.sourceQuestionId ?? input.sourceQuestionId ?? null,
        sourceType: input.sourceType ?? existing.sourceType ?? null,
        representativeQuote: existing.representativeQuote ?? input.representativeQuote ?? null,
        jtbdStatement: existing.jtbdStatement ?? input.jtbdStatement ?? null,
      },
    });
    return { id: updated.id, created: false, updated: true };
  }

  const created = await prisma.openTextTheme.create({
    data: {
      campaignId: input.campaignId,
      themeName: input.themeName,
      description: input.description ?? null,
      sourceQuestionId: input.sourceQuestionId ?? null,
      sourceType: input.sourceType ?? null,
      representativeQuote: input.representativeQuote ?? null,
      jtbdStatement: input.jtbdStatement ?? null,
      respondentCount: 0,
      percentage: 0,
      status: 'MONITOR',
    },
  });
  return { id: created.id, created: true, updated: false };
}

async function tagAnswer(themeId: string, answerId: string): Promise<boolean> {
  const before = await prisma.openTextThemeTag.findUnique({
    where: { themeId_answerId: { themeId, answerId } },
    select: { id: true },
  });
  await prisma.openTextThemeTag.upsert({
    where: { themeId_answerId: { themeId, answerId } },
    create: { themeId, answerId },
    update: {},
  });
  return !before;
}

function scoreLabel(answer: {
  textValue: string | null;
  numericValue: number | null;
  scoredValue: number | null;
  question: { questionType?: string; isReverseScored?: boolean };
}): string | null {
  const txt = (answer.textValue ?? '').trim();
  if (txt) return txt;
  const scored = answer.scoredValue ?? answer.numericValue;
  if (scored === null || scored === undefined) return null;
  const raw = answer.numericValue ?? scored;
  return answer.question.questionType === 'LIKERT'
    ? `Score ${scored}${answer.question.isReverseScored ? ` (raw ${raw}, reverse scored)` : ''}`
    : `Value ${raw}`;
}

const ROOT_CAUSE_LIBRARY: Array<{ match: RegExp; causes: string[] }> = [
  {
    match: /ci|cd|pipeline|build|test|flaky|deploy|release/i,
    causes: [
      'CI/CD pipeline stages are too serial and cannot give fast feedback.',
      'Flaky tests are creating false failures and forcing repeated reruns.',
      'Build and test infrastructure is under-provisioned during peak development hours.',
      'Failure messages do not clearly identify the broken component or owner.',
      'Deployment checks are manual or inconsistent across environments.',
      'Test suites are not well separated between smoke, integration, and full regression runs.',
      'Environment drift causes failures that are unrelated to the developer change.',
      'Pipeline ownership is unclear, so recurring failures are not permanently fixed.',
      'Release gates depend on approvals or handoffs that create queue time.',
      'Observability around build duration, failure rate, and retry causes is missing.',
    ],
  },
  {
    match: /review|pr|pull request|code review|rework/i,
    causes: [
      'Pull requests are too large, making reviews slow and hard to reason about.',
      'Reviewer ownership is unclear, so PRs wait before the right person engages.',
      'Review expectations are inconsistent across teams or senior engineers.',
      'Acceptance criteria are incomplete, causing rework during review.',
      'Automated checks do not catch common issues before human review.',
      'Review capacity is overloaded during sprint-end or release windows.',
      'Feedback is late, vague, or style-focused instead of risk-focused.',
      'Cross-team changes require reviewers who do not share the same priorities.',
      'Developers lack enough context to make safe changes on the first attempt.',
      'Definition of done is not explicit enough before implementation starts.',
    ],
  },
  {
    match: /requirement|acceptance|planning|priority|business|context|scope/i,
    causes: [
      'Requirements are not translated into testable acceptance criteria.',
      'Business context is missing, so engineers make assumptions during implementation.',
      'Priorities change after work starts, creating churn and partial rework.',
      'Product, design, and engineering do not share a single source of truth.',
      'Edge cases and non-functional requirements are discovered too late.',
      'Backlog items enter sprint planning before they are ready for development.',
      'Decision owners are unclear when tradeoffs or scope questions appear.',
      'User impact is not visible enough to guide technical decisions.',
      'Dependencies are not surfaced during planning, causing surprise blockers.',
      'Requirement changes are not communicated consistently after implementation begins.',
    ],
  },
  {
    match: /interrupt|context|meeting|focus|wip|activity|switch|deep work/i,
    causes: [
      'Developers are carrying too many concurrent work items.',
      'Ad-hoc requests bypass normal prioritization and interrupt planned work.',
      'Meeting load fragments the day and prevents deep work blocks.',
      'Urgent support or operational work is not capacity-planned.',
      'Teams lack explicit focus-time norms or interruption policies.',
      'Work is split across too many projects, services, or stakeholders.',
      'Priority changes are frequent and not accompanied by tradeoff decisions.',
      'Dependency follow-ups require repeated context switching across tools.',
      'Managers optimize for responsiveness instead of flow efficiency.',
      'Manual status reporting consumes time without reducing delivery risk.',
    ],
  },
  {
    match: /communication|collaboration|handoff|dependency|ownership|decision|api|contract|knowledge/i,
    causes: [
      'Ownership for services, APIs, or decisions is not easy to discover.',
      'Cross-team dependencies are identified too late in the delivery cycle.',
      'API or contract changes are not communicated before integration begins.',
      'Important decisions live in chat threads instead of durable documentation.',
      'Teams do not have clear escalation paths when blocked.',
      'Handoffs lose context between product, design, engineering, QA, and operations.',
      'Communication rituals report status but do not resolve blockers.',
      'Psychological safety issues prevent people from raising risks early.',
      'Documentation is stale, fragmented, or not connected to service ownership.',
      'Remote or distributed collaboration norms are not explicit enough.',
    ],
  },
  {
    match: /tool|environment|local|provision|ide|flow|automation|manual|toil/i,
    causes: [
      'Local development setup is fragile or differs from shared environments.',
      'Developers rely on manual steps that could be automated safely.',
      'Tooling is fragmented, requiring repeated switching and duplicated context.',
      'Environment provisioning depends on tickets, approvals, or specialist help.',
      'Common tasks lack paved-road scripts, templates, or self-service workflows.',
      'Platform teams do not have enough feedback loops from product engineers.',
      'Access, secrets, or configuration issues repeatedly block setup and testing.',
      'Tool performance problems are normalized instead of tracked as productivity debt.',
      'Engineering standards are spread across multiple locations and hard to follow.',
      'Automation opportunities are known but not prioritized against feature work.',
    ],
  },
  {
    match: /incident|rca|production|stability|page|hotfix|quality|defect/i,
    causes: [
      'Production signals do not identify the affected service, owner, or likely change quickly.',
      'Incident response depends on a small number of experienced engineers.',
      'Runbooks are missing, stale, or not tied to current architecture.',
      'Change impact is hard to predict before code is merged.',
      'Testing strategy does not catch integration or regression risk early enough.',
      'Post-incident actions are not tracked to durable completion.',
      'Monitoring focuses on symptoms but not actionable root indicators.',
      'Release practices make rollback or mitigation slower than expected.',
      'Technical debt in critical paths increases operational fragility.',
      'Ownership boundaries between build, run, and support are unclear.',
    ],
  },
  {
    match: /satisfaction|wellbeing|burnout|morale|growth|autonomy|psychological|safety/i,
    causes: [
      'Developers do not feel safe raising delivery risks or technical concerns early.',
      'High workload is sustained through overtime or hidden recovery time.',
      'Recognition systems value output volume more than sustainable engineering quality.',
      'Career growth, learning time, or autonomy is being crowded out by delivery pressure.',
      'Repeated blockers have become normalized, reducing sense of progress.',
      'Engineers lack influence over tooling, process, or technical debt priorities.',
      'Managers do not have enough visibility into daily friction and cognitive load.',
      'Teams are asked to absorb unplanned work without explicit capacity tradeoffs.',
      'Low-value work reduces energy and sense of accomplishment.',
      'Feedback loops do not show how developer improvements are acted on.',
    ],
  },
  {
    match: /debt|legacy|comprehension|unfamiliar|blast radius|architecture/i,
    causes: [
      'Code ownership and architectural boundaries are not clear enough.',
      'Legacy areas lack tests, documentation, or current subject-matter experts.',
      'Change impact is difficult to assess across services and dependencies.',
      'Technical debt is visible but not connected to planning and prioritization.',
      'Developers lack safe refactoring time before adding new functionality.',
      'Important domain knowledge is held by a small number of people.',
      'Service maps, dependency diagrams, or runtime ownership data are missing.',
      'The codebase lacks consistent patterns for common implementation tasks.',
      'Onboarding paths do not teach how to make safe changes in risky areas.',
      'Quality gates catch problems late instead of guiding implementation early.',
    ],
  },
];

const GENERIC_ROOT_CAUSES = [
  'The blocker has no clear owner responsible for permanent resolution.',
  'The issue is treated as normal friction instead of measured productivity loss.',
  'Teams lack enough data to quantify the blocker and prioritize it confidently.',
  'Workflows depend on manual handoffs that create queue time and rework.',
  'Policy, process, or tooling decisions are made without enough developer feedback.',
  'The blocker spans multiple teams, so no single team can solve it alone.',
  'Documentation, ownership, and operational knowledge are fragmented.',
  'Short-term delivery pressure repeatedly defers system improvement work.',
  'Existing metrics emphasize activity rather than developer flow and outcomes.',
  'Improvement actions are started but not tracked through sustained adoption.',
];

function suggestedRootCauses(input: {
  themeName: string;
  description: string | null;
  questionTexts: string[];
}): string[] {
  const text = [input.themeName, input.description, ...input.questionTexts]
    .filter(Boolean)
    .join(' ');
  const selected = ROOT_CAUSE_LIBRARY.find((entry) => entry.match.test(text))?.causes
    ?? GENERIC_ROOT_CAUSES;
  return selected.slice(0, 10);
}

// ─── List + tagged answers ─────────────────────────────────────────────
themesRouter.get('/', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const includeEmpty = req.query.includeEmpty === 'true';
    const totalRespondents = await totalCompletedRespondents(campaignId);
    if (!includeEmpty && totalRespondents === 0) {
      return res.json({ items: [] });
    }
    const items = await prisma.openTextTheme.findMany({
      where: { campaignId, NOT: { sourceType: 'Cross-Dimension Metric' } },
      orderBy: [{ status: 'asc' }, { respondentCount: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { tags: true } },
      },
    });
    res.json({
      items: items
        .filter((t) => includeEmpty || t._count.tags > 0)
        .map((t) => ({
          id: t.id,
          campaignId: t.campaignId,
          themeName: t.themeName,
          description: t.description,
          sourceQuestionId: t.sourceQuestionId,
          sourceType: t.sourceType,
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
            question: {
              select: {
                questionNumber: true,
                questionText: true,
                questionType: true,
                isReverseScored: true,
              },
            },
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
        displayText: scoreLabel(t.answer),
        numericValue: t.answer.numericValue,
        scoredValue: t.answer.scoredValue,
        questionType: t.answer.question.questionType,
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
          questionType: true,
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

      const signalQuestionMap = new Map<string, { id: string; sourceType: 'Numeric Question' | 'Text Question' }>();
      for (const q of questionnaireThemesRaw) {
        const signal = (q.blockerSignal ?? '').trim();
        if (!signal) continue;
        if (!signalQuestionMap.has(signal)) {
          signalQuestionMap.set(signal, {
            id: q.id,
            sourceType: sourceTypeForQuestion(q.questionType),
          });
        }
      }

      const themeIdByName = new Map<string, string>();
      let createdCount = 0;
      for (const themeName of questionnaireThemes) {
        const source = signalQuestionMap.get(themeName);
        const existing = await prisma.openTextTheme.findFirst({
          where: { campaignId, themeName },
          select: { id: true },
        });
        if (existing) {
          await prisma.openTextTheme.update({
            where: { id: existing.id },
            data: {
              sourceQuestionId: source?.id ?? null,
              sourceType: source?.sourceType ?? 'Text Question',
            },
          });
          themeIdByName.set(themeName, existing.id);
          continue;
        }
        const created = await prisma.openTextTheme.create({
          data: {
            campaignId,
            themeName,
            sourceQuestionId: source?.id ?? null,
            sourceType: source?.sourceType ?? 'Text Question',
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
          sourceType: true,
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
        sourceType: string | null;
      }> = updatedThemes
        .filter((t) => touchedThemeIds.has(t.id) || t.respondentCount > 0)
        .map((t) => ({
          id: t.id,
          themeName: t.themeName,
          status: t.status,
          respondentCount: t.respondentCount,
          percentage: t.percentage,
          tagCount: t.respondentCount,
          sourceType: t.sourceType,
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
      await loadCampaign(companyId, campaignId);
      const body = ThemeCreateSchema.parse(req.body);
      const created = await prisma.openTextTheme.create({
        data: {
          campaignId,
          themeName: body.themeName,
          description: body.description ?? null,
          sourceQuestionId: body.sourceQuestionId ?? null,
          sourceType: body.sourceType ?? null,
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
      await loadCampaign(companyId, campaignId);
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
          ...(body.sourceType !== undefined ? { sourceType: body.sourceType } : {}),
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
            question: {
              select: {
                id: true,
                questionNumber: true,
                questionText: true,
                questionType: true,
                isReverseScored: true,
              },
            },
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
      {
        questionId: string;
        questionNumber: number;
        questionText: string;
        respondents: Set<string>;
        answerCount: number;
        answers: { answerId: string; text: string; roleLabel: string | null; submissionId: string }[];
      }
    >();
    for (const t of tags) {
      const q = t.answer.question;
      let g = byQuestion.get(q.id);
      if (!g) {
        g = {
          questionId: q.id,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          respondents: new Set(),
          answerCount: 0,
          answers: [],
        };
        byQuestion.set(q.id, g);
      }
      g.respondents.add(t.answer.submission.id);
      g.answerCount += 1;
      const txt = scoreLabel(t.answer);
      if (txt) {
        g.answers.push({
          answerId: t.answer.id,
          text: txt,
          roleLabel: t.answer.submission.roleLabel ?? null,
          submissionId: t.answer.submission.id,
        });
      }
    }

    // Group respondents by role
    const byRole = new Map<string, Set<string>>();
    for (const t of tags) {
      const role = t.answer.submission.roleLabel ?? 'Unattributed';
      let s = byRole.get(role);
      if (!s) { s = new Set(); byRole.set(role, s); }
      s.add(t.answer.submission.id);
    }
    const relatedQuestionTexts = [...byQuestion.values()].map((q) => q.questionText);

    res.json({
      id: theme.id,
      themeName: theme.themeName,
      description: theme.description,
      sourceType: theme.sourceType,
      status: theme.status,
      representativeQuote: theme.representativeQuote,
      jtbdStatement: theme.jtbdStatement,
      respondentCount: respondentIds.size,
      percentage: totalRespondents > 0 ? Math.round((respondentIds.size / totalRespondents) * 1000) / 10 : 0,
      tagCount: tags.length,
      totalRespondents,
      possibleRootCauses: suggestedRootCauses({
        themeName: theme.themeName,
        description: theme.description,
        questionTexts: relatedQuestionTexts,
      }),
      questions: [...byQuestion.values()]
        .map((g) => ({
          questionId: g.questionId,
          questionNumber: g.questionNumber,
          questionText: g.questionText,
          respondentCount: g.respondents.size,
          answerCount: g.answerCount,
          percentage: totalRespondents > 0 ? Math.round((g.respondents.size / totalRespondents) * 1000) / 10 : 0,
          answers: g.answers,
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

// ─── Auto-generate themes from questionnaire, numeric, matrix, and text evidence ───────────────────────
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
      // Incremental by default: only analyse answers that have NOT been tagged yet.
      // Pass { incremental: false } to re-analyse every answer (legacy behaviour).
      const incremental = req.body?.incremental !== false && !replace;
      const totalRespondents = await totalCompletedRespondents(campaignId);

      if (totalRespondents === 0) {
        return res.json({
          created: 0,
          updated: 0,
          totalTagged: 0,
          totalRespondents,
          themes: [],
          incremental,
          questionnaireThemeCount: 0,
          crossPatternThemeCount: 0,
          clusterThemeCount: 0,
          note: 'No completed survey submissions yet. Theme analysis runs after at least one survey is submitted.',
        });
      }

      if (replace) {
        await prisma.openTextTheme.deleteMany({ where: { campaignId } });
      }

      const questions = await prisma.question.findMany({
        where: {
          questionnaireId: campaign.questionnaireId,
          status: 'ACTIVE',
          NOT: { blockerSignal: null },
        },
        include: { dimension: { select: { code: true, name: true } } },
        orderBy: { questionNumber: 'asc' },
      });

      const allAnswers = await prisma.answer.findMany({
        where: {
          submission: { campaignId, status: 'COMPLETED' },
          question: { questionnaireId: campaign.questionnaireId },
        },
        include: {
          question: {
            include: { dimension: { select: { code: true, name: true } } },
          },
          themeTags: { select: { themeId: true } },
        },
      });

      let created = 0;
      let updated = 0;
      let totalTagged = 0;
      const generatedThemeIds = new Set<string>();
      const themeIdByName = new Map<string, string>();

      const rememberTheme = async (input: {
        themeName: string;
        description?: string | null;
        sourceQuestionId?: string | null;
        sourceType?: string | null;
        representativeQuote?: string | null;
        jtbdStatement?: string | null;
      }) => {
        const result = await upsertGeneratedTheme({ campaignId, ...input });
        themeIdByName.set(input.themeName, result.id);
        generatedThemeIds.add(result.id);
        if (result.created) created += 1;
        else if (result.updated) updated += 1;
        return result.id;
      };

      const firstQuestionBySignal = new Map<string, typeof questions[number]>();
      for (const q of questions) {
        const signal = (q.blockerSignal ?? '').trim();
        if (signal && !firstQuestionBySignal.has(signal)) {
          firstQuestionBySignal.set(signal, q);
        }
      }

      for (const [themeName, q] of firstQuestionBySignal.entries()) {
        await rememberTheme({
          themeName,
          sourceQuestionId: q.id,
          sourceType: q.questionType === 'OPEN_TEXT' ? 'Text Question' : 'Numeric Question',
          description: `Questionnaire blocker signal from ${q.dimension.code} dimension, Q${q.questionNumber}: ${q.questionText}`,
        });
      }

      for (const answer of allAnswers) {
        const signal = (answer.question.blockerSignal ?? '').trim();
        if (!signal) continue;
        const themeId = themeIdByName.get(signal);
        if (!themeId) continue;

        const hasOpenEvidence =
          answer.question.questionType === 'OPEN_TEXT' &&
          (answer.textValue ?? '').trim().length > 0;
        const hasLowNumericEvidence =
          answer.question.questionType === 'LIKERT' &&
          answer.scoredValue !== null &&
          answer.scoredValue <= 3;

        if (hasOpenEvidence || hasLowNumericEvidence) {
          if (await tagAnswer(themeId, answer.id)) totalTagged += 1;
        }
      }

      const answersForClusters = allAnswers
        .filter((a) => {
          if (a.question.questionType !== 'OPEN_TEXT') return false;
          if ((a.textValue ?? '').trim().length === 0) return false;
          return incremental ? a.themeTags.length === 0 : true;
        })
        .map((a) => ({ id: a.id, text: a.textValue as string }));

      const clusters = answersForClusters.length > 0
        ? clusterAnswers(answersForClusters, { minSize })
        : [];

      for (const cluster of clusters) {
        const themeId = await rememberTheme({
          themeName: cluster.themeName,
          sourceType: 'Text Question',
          description: cluster.description,
          jtbdStatement: cluster.jtbdStatement,
          representativeQuote: cluster.representativeQuote,
        });
        for (const answerId of cluster.answerIds) {
          if (await tagAnswer(themeId, answerId)) totalTagged += 1;
        }
      }

      for (const themeId of generatedThemeIds) {
        await recomputeStatsAndStatus(themeId);
      }

      const summary = await prisma.openTextTheme.findMany({
        where: { id: { in: [...generatedThemeIds] } },
        include: { _count: { select: { tags: true } } },
        orderBy: [{ status: 'asc' }, { respondentCount: 'desc' }, { themeName: 'asc' }],
      });
      const summaryThemes = summary.map((theme) => ({
        id: theme.id,
        themeName: theme.themeName,
        sourceType: theme.sourceType,
        respondentCount: theme.respondentCount,
        percentage: theme.percentage,
        status: theme.status,
        tagCount: theme._count.tags,
      }));
      const visibleThemes = summaryThemes.filter((theme) => theme.tagCount > 0);

      recordAudit(req, 'themes.autoGenerate', 'OpenTextTheme', campaignId, {
        created,
        updated,
        totalTagged,
        questionnaireThemes: firstQuestionBySignal.size,
        crossPatternThemes: 0,
        clusters: clusters.length,
        totalRespondents,
      });

      await trySaveArtifact('themes', companyId, campaignId, {
        generatedAt: new Date().toISOString(),
        incremental,
        replace,
        created,
        updated,
        totalTagged,
        totalRespondents,
        questionnaireThemeCount: firstQuestionBySignal.size,
        crossPatternThemeCount: 0,
        clusterThemeCount: clusters.length,
        generatedCandidateCount: summaryThemes.length,
        themes: visibleThemes,
      });
      await trySaveArtifact('analysis-results', companyId, campaignId, {
        kind: 'theme-auto-generate',
        ranAt: new Date().toISOString(),
        incremental,
        inputCount: allAnswers.length,
        openTextClusterInputCount: answersForClusters.length,
        clustersFound: clusters.length,
        questionnaireThemeCount: firstQuestionBySignal.size,
        crossPatternThemeCount: 0,
        generatedCandidateCount: summaryThemes.length,
        visibleThemeCount: visibleThemes.length,
        created,
        updated,
        totalTagged,
      });

      res.json({
        created,
        updated,
        totalTagged,
        totalRespondents,
        themes: visibleThemes,
        incremental,
        questionnaireThemeCount: firstQuestionBySignal.size,
        crossPatternThemeCount: 0,
        clusterThemeCount: clusters.length,
      });
    } catch (e) { next(e); }
  },
);

