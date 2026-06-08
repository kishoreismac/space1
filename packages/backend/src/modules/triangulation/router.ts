import { Router } from 'express';
import { ZodError, z } from 'zod';
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
import { trySaveArtifact } from '../../lib/storage.js';

export const triangulationRouter = Router({ mergeParams: true });
triangulationRouter.use(requireAuth);

const doraMetricKeys = [
  'leadTimeForChanges',
  'deploymentFrequency',
  'mttr',
  'changeFailureRate',
  'avgBuildTimeMinutes',
  'flakyTestFailureRate',
  'prAvgReviewIterations',
  'prFirstReviewLagHours',
  'ideAvgActiveSessionLengthMinutes',
] as const;

const DoraMetricsSchema = z.object(
  Object.fromEntries(
    doraMetricKeys.map((key) => [key, z.string().max(500).nullable().optional()]),
  ) as Record<(typeof doraMetricKeys)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>,
);

type DoraMetrics = z.infer<typeof DoraMetricsSchema>;
type DoraCycle = 'current' | 'previous';

const emptyDoraMetrics = (): DoraMetrics =>
  Object.fromEntries(doraMetricKeys.map((key) => [key, null])) as DoraMetrics;

const doraSignalName = (cycle: DoraCycle) =>
  cycle === 'current' ? 'DORA_CURRENT_CYCLE' : 'DORA_PREVIOUS_CYCLE';

function parseDoraMetrics(raw: string | null): DoraMetrics {
  if (!raw) return emptyDoraMetrics();
  try {
    return { ...emptyDoraMetrics(), ...DoraMetricsSchema.parse(JSON.parse(raw)) };
  } catch {
    return emptyDoraMetrics();
  }
}

function handleZod(err: ZodError): HttpError {
  return new HttpError(400, 'Invalid request body', err.issues);
}

type Phase2ThemeSource = 'Numeric Question' | 'Text Question';

function normalizeThemeSource(sourceType: string | null | undefined): Phase2ThemeSource {
  if (sourceType === 'Numeric Question') return 'Numeric Question';
  return 'Text Question';
}

function blockerSourcePhaseFromTheme(sourceType: string | null | undefined): string {
  return `PHASE 2 - ${normalizeThemeSource(sourceType)}`;
}

function evidenceLabelFromThemeSource(sourceType: string | null | undefined): string {
  const source = normalizeThemeSource(sourceType);
  if (source === 'Numeric Question') return 'Numeric question evidence';
  return 'Open-text question evidence';
}

function themeEvidenceSummary(t: {
  sourceType: string | null;
  respondentCount: number;
  percentage: number;
  status: string;
  jtbdStatement: string | null;
  description: string | null;
}): string {
  const label = evidenceLabelFromThemeSource(t.sourceType);
  const details = [t.jtbdStatement, t.description].filter(Boolean).join(' ');
  return [
    `${label} from Phase 2`,
    `${t.respondentCount} respondents (${t.percentage}% of campaign)`,
    `status: ${t.status}`,
    details ? `details: ${details}` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

function inferSdlcPhase(...values: Array<string | null | undefined>): string {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (/requirement|acceptance|scope|planning|priority|backlog|business context|spec/.test(text)) return 'Planning';
  if (/code review|review|pull request|\bpr\b|merge/.test(text)) return 'Review';
  if (/ci|cd|pipeline|build|compile/.test(text)) return 'Build';
  if (/test|flaky|qa|regression|failure rate/.test(text)) return 'Test';
  if (/deploy|release|change failure|lead time/.test(text)) return 'Deploy';
  if (/incident|mttr|restore|production|operations|support|outage|rca/.test(text)) return 'Operations';
  if (/code|coding|development|developer|local env|environment|ide|onboard/.test(text)) return 'Coding';
  if (/meeting|interrupt|context switch|focus|handoff|collaboration|communication/.test(text)) return 'Collaboration';
  return 'Cross-SDLC';
}

async function loadCampaign(companyId: string, campaignId: string) {
  const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return c;
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

// ─── Blockers ──────────────────────────────────────────────────────────
triangulationRouter.get('/dora-metrics', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);

    const signals = await prisma.validationSignal.findMany({
      where: {
        campaignId,
        blockerId: null,
        signalType: 'DORA',
        signalName: { in: [doraSignalName('current'), doraSignalName('previous')] },
      },
    });

    const current = signals.find((s) => s.signalName === doraSignalName('current'));
    const previous = signals.find((s) => s.signalName === doraSignalName('previous'));
    res.json({
      current: parseDoraMetrics(current?.evidenceDescription ?? null),
      previous: parseDoraMetrics(previous?.evidenceDescription ?? null),
      updatedAt: {
        current: current?.createdAt ?? null,
        previous: previous?.createdAt ?? null,
      },
    });
  } catch (e) {
    next(e);
  }
});

triangulationRouter.put(
  '/dora-metrics/:cycle',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, cycle } = req.params as {
        companyId: string;
        campaignId: string;
        cycle: string;
      };
      if (cycle !== 'current' && cycle !== 'previous') {
        throw new HttpError(400, 'Cycle must be current or previous');
      }
      assertCompanyAccess(req.auth, companyId);
      const campaign = await loadCampaign(companyId, campaignId);

      const body = DoraMetricsSchema.parse(req.body);
      const data = { ...emptyDoraMetrics(), ...body };
      const filledValues = Object.values(data).filter(Boolean).length;
      const signalName = doraSignalName(cycle);
      const existing = await prisma.validationSignal.findFirst({
        where: { campaignId, blockerId: null, signalType: 'DORA', signalName },
      });

      const saved = existing
        ? await prisma.validationSignal.update({
            where: { id: existing.id },
            data: {
              evidenceValue: `${filledValues} metrics captured`,
              evidenceDescription: JSON.stringify(data),
              confirmed: filledValues > 0,
            },
          })
        : await prisma.validationSignal.create({
            data: {
              campaignId,
              blockerId: null,
              signalType: 'DORA',
              signalName,
              evidenceValue: `${filledValues} metrics captured`,
              evidenceDescription: JSON.stringify(data),
              confirmed: filledValues > 0,
            },
          });

      recordAudit(req, 'triangulation.doraMetrics.save', 'ValidationSignal', saved.id, {
        cycle,
        filledValues,
      });
      // Mirror to Azure Blob Storage as durable artifact
      await trySaveArtifact('dora-metrics', companyId, campaignId, {
        cycle,
        metrics: data,
        filledValues,
        savedBy: req.auth?.sub ?? null,
        savedAt: new Date().toISOString(),
      });
      res.json({ cycle, metrics: data, updatedAt: saved.createdAt });
    } catch (e) {
      if (e instanceof ZodError) return next(handleZod(e));
      next(e);
    }
  },
);

triangulationRouter.get('/matrix', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const items = await prisma.blocker.findMany({
      where: phase2BlockerWhere(campaignId),
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      include: {
        signals: {
          where: { signalType: { in: ['SURVEY', 'DORA', 'THEME'] } },
          orderBy: [{ signalType: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

triangulationRouter.get('/blockers', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);
    const items = await prisma.blocker.findMany({
      where: phase2BlockerWhere(campaignId),
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
      const campaign = await loadCampaign(companyId, campaignId);
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
      const campaign = await loadCampaign(companyId, campaignId);
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
// Auto-derive candidate blockers from Phase 2 themes to seed the triangulation workflow.
triangulationRouter.get('/candidates', async (req, res, next) => {
  try {
    const { companyId, campaignId } = req.params as {
      companyId: string;
      campaignId: string;
    };
    assertCompanyAccess(req.auth, companyId);
    await loadCampaign(companyId, campaignId);

    // Phase 2 blocker themes with actual respondent evidence
    const themes = await prisma.openTextTheme.findMany({
      where: {
        campaignId,
        NOT: { sourceType: 'Cross-Dimension Metric' },
        OR: [{ respondentCount: { gt: 0 } }, { tags: { some: {} } }],
      },
      orderBy: [{ respondentCount: 'desc' }, { themeName: 'asc' }],
      select: {
        id: true,
        themeName: true,
        respondentCount: true,
        percentage: true,
        jtbdStatement: true,
        description: true,
        sourceType: true,
        status: true,
      },
    });

    res.json({
      dimensions: [],
      themes,
      journeySteps: [],
    });
  } catch (e) {
    next(e);
  }
});

// ─── Auto-seed validated blockers from survey signals ─────────────────
// Creates a Blocker for each Phase 2 theme and attaches ValidationSignal records linking back to theme
// evidence. Idempotent: skips candidates with an existing Blocker of the same title.
triangulationRouter.post(
  '/auto-seed',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as {
        companyId: string;
        campaignId: string;
      };
      assertCompanyAccess(req.auth, companyId);
      await loadCampaign(companyId, campaignId);

      // ── Reuse the Phase 2 theme candidate logic inline ──
      const themes = await prisma.openTextTheme.findMany({
        where: {
          campaignId,
          NOT: { sourceType: 'Cross-Dimension Metric' },
          OR: [{ respondentCount: { gt: 0 } }, { tags: { some: {} } }],
        },
        orderBy: [{ respondentCount: 'desc' }, { themeName: 'asc' }],
      });
      const sourceQuestionIds = [
        ...new Set(themes.map((t) => t.sourceQuestionId).filter((id): id is string => Boolean(id))),
      ];
      const sourceQuestions = sourceQuestionIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: sourceQuestionIds } },
            include: { dimension: { select: { code: true } } },
          })
        : [];
      const sourceQuestionDimensionById = new Map(
        sourceQuestions.map((q) => [q.id, q.dimension.code]),
      );
      const totalRespondents = await prisma.submission.count({
        where: { campaignId, status: 'COMPLETED' },
      });

      const existing = await prisma.blocker.findMany({ where: phase2BlockerWhere(campaignId) });
      const existingByTitle = new Map(existing.map((b) => [b.title.toLowerCase(), b]));

      let created = 0;
      const summary: Array<{ id: string; title: string; severity: string; sources: number }> = [];

      const sevFromTheme = (percentage: number) =>
        percentage >= 40 ? 'P1' : percentage >= 25 ? 'P2' : percentage >= 10 ? 'P3' : 'P4';
      const dimensionCodeFromTheme = (t: (typeof themes)[number]) =>
        t.sourceQuestionId ? sourceQuestionDimensionById.get(t.sourceQuestionId) ?? null : null;
      const upsertThemeSignal = async (blockerId: string, t: (typeof themes)[number]) => {
        const signalName = `${t.themeName} (${normalizeThemeSource(t.sourceType)})`;
        const existingSignal = await prisma.validationSignal.findFirst({
          where: {
            campaignId,
            blockerId,
            signalType: 'THEME',
            signalName,
          },
        });
        const data = {
          evidenceValue: `${t.respondentCount} respondents (${t.percentage}%)`,
          evidenceDescription: themeEvidenceSummary(t),
          confirmed: t.status === 'PROMOTE',
        };
        if (existingSignal) {
          await prisma.validationSignal.update({
            where: { id: existingSignal.id },
            data,
          });
          return;
        }
        await prisma.validationSignal.create({
          data: {
            campaignId,
            blockerId,
            signalType: 'THEME',
            signalName,
            ...data,
          },
        });
      };

      // From Phase 2 themes not already covered
      for (const t of themes) {
        const title = t.themeName;
        const existingThemeBlocker = existingByTitle.get(title.toLowerCase());
        if (existingThemeBlocker) {
          const missingUpdates: { sdlcPhase?: string; dimensionCode?: string | null } = {};
          if (!existingThemeBlocker.sdlcPhase) {
            missingUpdates.sdlcPhase = inferSdlcPhase(t.themeName, t.description, t.jtbdStatement);
          }
          if (!existingThemeBlocker.dimensionCode) {
            missingUpdates.dimensionCode = dimensionCodeFromTheme(t);
          }
          if (Object.keys(missingUpdates).length > 0) {
            await prisma.blocker.update({
              where: { id: existingThemeBlocker.id },
              data: missingUpdates,
            });
          }
          await upsertThemeSignal(existingThemeBlocker.id, t);
          summary.push({
            id: existingThemeBlocker.id,
            title,
            severity: existingThemeBlocker.severity,
            sources: existingThemeBlocker.sourcePhase?.startsWith('PHASE 2') ? 1 : 2,
          });
          continue;
        }
        const sev = sevFromTheme(t.percentage);
        const b = await prisma.blocker.create({
          data: {
            campaignId,
            title,
            description: t.description ?? `Auto-seeded from Phase 2 theme analysis (${t.percentage}% of campaign).`,
            sourcePhase: blockerSourcePhaseFromTheme(t.sourceType),
            dimensionCode: dimensionCodeFromTheme(t),
            sdlcPhase: inferSdlcPhase(t.themeName, t.description, t.jtbdStatement),
            severity: sev,
            evidenceSummary: themeEvidenceSummary(t),
            reachPercentage: t.percentage,
            aiFit: 'CANDIDATE',
            status: 'OPEN',
          },
        });
        await upsertThemeSignal(b.id, t);
        existingByTitle.set(title.toLowerCase(), b);
        created += 1;
        summary.push({ id: b.id, title, severity: sev, sources: 1 });
      }

      recordAudit(req, 'triangulation.autoSeed', 'Blocker', campaignId, { created });
      res.json({ created, totalRespondents, blockers: summary });
    } catch (e) {
      next(e);
    }
  },
);
