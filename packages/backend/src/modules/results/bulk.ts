/**
 * Bulk results upload — parses CSV/JSON of survey responses and creates
 * COMPLETED submissions + answers for a campaign without invites.
 *
 * CSV expected columns (case-insensitive, in any order):
 *   team, role, name, years, primary, Q1, Q2, ..., QN
 * Q* columns may be numeric (LIKERT 1-5) or text (OPEN_TEXT).
 *
 * JSON payload alternative for the API:
 *   { rows: [ { team, role, name, years, primary, answers: { "1": 4, "10": "..." } } ] }
 *
 * Manual single-row entry is also supported via /manual which inserts ONE
 * submission given averaged dimension scores (S/P/A/C/E) — used by the
 * Phase 1 triage "no survey, just paste my numbers" workflow.
 */
import { Router } from 'express';
import { z, ZodError } from 'zod';
import type { Prisma } from '@prisma/client';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const bulkUploadRouter = Router({ mergeParams: true });
bulkUploadRouter.use(requireAuth);

const RowSchema = z.object({
  team: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  years: z.string().nullable().optional(),
  primary: z.string().nullable().optional(),
  answers: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
});

const BulkBodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(2000),
  replace: z.boolean().optional(),
});

const ManualSchema = z.object({
  S: z.number().min(1).max(5).nullable().optional(),
  P: z.number().min(1).max(5).nullable().optional(),
  A: z.number().min(1).max(5).nullable().optional(),
  C: z.number().min(1).max(5).nullable().optional(),
  E: z.number().min(1).max(5).nullable().optional(),
  respondents: z.number().int().positive().max(2000).default(1),
  label: z.string().max(60).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Tiny CSV parser — handles quoted fields, escaped quotes, CRLF, commas in quotes. */
function parseCsv(input: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Trim trailing empty rows
  while (rows.length && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0]!.map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]!] = (rows[r]![c] ?? '').trim();
    out.push(obj);
  }
  return { headers, rows: out };
}

interface NormalisedRow {
  team: string | null;
  role: string | null;
  name: string | null;
  years: string | null;
  primary: string | null;
  answers: Record<string, number | string | null>;
}

function csvToRows(csv: string): NormalisedRow[] {
  const { headers, rows } = parseCsv(csv);
  if (headers.length === 0) return [];
  const lower = headers.map((h) => h.toLowerCase());
  const idx = (name: string) => lower.indexOf(name);
  const get = (r: Record<string, string>, name: string) => r[headers[idx(name)] ?? ''] ?? null;

  const qHeaders = headers.filter((h) => /^q\d+$/i.test(h));

  return rows.map((r) => {
    const answers: Record<string, number | string | null> = {};
    for (const h of qHeaders) {
      const raw = (r[h] ?? '').trim();
      if (raw === '') continue;
      const m = h.match(/^q(\d+)$/i);
      if (!m) continue;
      const key = m[1]!;
      const asNum = Number(raw);
      answers[key] = Number.isFinite(asNum) && !/[a-zA-Z]/.test(raw) ? asNum : raw;
    }
    return {
      team: get(r, 'team') || null,
      role: get(r, 'role') || null,
      name: get(r, 'name') || null,
      years: get(r, 'years') || null,
      primary: get(r, 'primary') || get(r, 'primary language') || null,
      answers,
    };
  });
}

async function loadCampaignWithQs(companyId: string, campaignId: string) {
  const campaign = await prisma.surveyCampaign.findUnique({
    where: { id: campaignId },
    include: {
      questionnaire: {
        include: { questions: { select: { id: true, questionNumber: true, questionType: true } } },
      },
    },
  });
  if (!campaign || campaign.companyId !== companyId) throw new HttpError(404, 'Campaign not found');
  return campaign;
}

async function resolveTeamId(
  companyId: string,
  teamName: string | null,
): Promise<string | null> {
  if (!teamName) return null;
  const found = await prisma.team.findFirst({
    where: { companyId, name: { equals: teamName } },
    select: { id: true },
  });
  return found?.id ?? null;
}

// ── POST /bulk — rich row upload ───────────────────────────────────

bulkUploadRouter.post(
  '/bulk',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);

      let rows: NormalisedRow[] = [];
      let replace = false;

      // Accept either { csv: "..." } or { rows: [...] }
      if (typeof req.body?.csv === 'string') {
        rows = csvToRows(req.body.csv as string);
        replace = !!req.body.replace;
      } else {
        const body = BulkBodySchema.parse(req.body);
        rows = body.rows.map((r) => ({
          team: r.team ?? null,
          role: r.role ?? null,
          name: r.name ?? null,
          years: r.years ?? null,
          primary: r.primary ?? null,
          answers: r.answers,
        }));
        replace = !!body.replace;
      }

      if (rows.length === 0) throw new HttpError(400, 'No rows parsed');

      const campaign = await loadCampaignWithQs(companyId, campaignId);
      const qByNum = new Map(
        campaign.questionnaire.questions.map((q) => [q.questionNumber, q]),
      );

      if (replace) {
        await prisma.submission.deleteMany({
          where: { campaignId, inviteId: null },
        });
      }

      let created = 0;
      let answerCount = 0;
      const skipped: Array<{ row: number; reason: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        const teamId = await resolveTeamId(companyId, r.team);

        const answersData: Prisma.AnswerCreateManyInput[] = [];
        for (const [k, v] of Object.entries(r.answers)) {
          const num = Number(k);
          if (!Number.isFinite(num)) continue;
          const q = qByNum.get(num);
          if (!q) continue;
          let numericValue: number | null = null;
          let textValue: string | null = null;
          if (typeof v === 'number') {
            numericValue = v;
          } else if (typeof v === 'string') {
            const asNum = Number(v);
            if (q.questionType === 'LIKERT' && Number.isFinite(asNum)) numericValue = asNum;
            else textValue = v;
          }
          if (numericValue == null && (!textValue || textValue.trim() === '')) continue;
          answersData.push({
            submissionId: '__placeholder__',
            questionId: q.id,
            rawValue: v == null ? null : String(v),
            numericValue,
            textValue,
          });
        }
        if (answersData.length === 0) {
          skipped.push({ row: i + 1, reason: 'no recognised answers' });
          continue;
        }

        const submission = await prisma.submission.create({
          data: {
            campaignId,
            questionnaireId: campaign.questionnaireId,
            anonymousParticipantKey: `bulk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            teamId,
            roleLabel: r.role,
            yearsAtCompany: r.years,
            primaryTechnology: r.primary,
            submittedAt: new Date(),
            status: 'COMPLETED',
          },
        });

        await prisma.answer.createMany({
          data: answersData.map((a) => ({ ...a, submissionId: submission.id })),
        });
        created++;
        answerCount += answersData.length;
      }

      recordAudit(req, 'results.bulkUpload', 'SurveyCampaign', campaignId, {
        rowsCreated: created,
        rowsSkipped: skipped.length,
        answerCount,
        replace,
      });

      res.status(201).json({
        created,
        skipped,
        answerCount,
        totalRows: rows.length,
        replace,
      });
    } catch (e) {
      if (e instanceof ZodError) return next(new HttpError(422, 'Invalid bulk payload', e.flatten()));
      next(e);
    }
  },
);

// ── POST /manual — synthesise submissions from dimension averages ────
// Used by Phase 1 Triage "I already have my dimension scores" workflow.
// Creates `respondents` synthetic LIKERT submissions whose answers all sit
// at the provided dimension score (rounded to nearest integer 1-5). This
// gives the downstream pipeline real Answer rows to aggregate without
// asking the user to hand-craft 50 question values.
bulkUploadRouter.post(
  '/manual',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId } = req.params as { companyId: string; campaignId: string };
      assertCompanyAccess(req.auth, companyId);
      const body = ManualSchema.parse(req.body);
      const campaign = await loadCampaignWithQs(companyId, campaignId);

      const dimToScore: Record<string, number | null> = {
        S: body.S ?? null,
        P: body.P ?? null,
        A: body.A ?? null,
        C: body.C ?? null,
        E: body.E ?? null,
      };

      // Group questions by dimension code via the dimension include.
      const qsWithDim = await prisma.question.findMany({
        where: { questionnaireId: campaign.questionnaireId, questionType: 'LIKERT' },
        include: { dimension: { select: { code: true } } },
      });

      // Replace any previously-synthesised manual rows for clean re-runs.
      await prisma.submission.deleteMany({
        where: {
          campaignId,
          inviteId: null,
          anonymousParticipantKey: { startsWith: 'manual-' },
        },
      });

      const created: string[] = [];
      const respondents = body.respondents;
      for (let i = 0; i < respondents; i++) {
        const answersData: Prisma.AnswerCreateManyInput[] = [];
        for (const q of qsWithDim) {
          const code = q.dimension.code.toUpperCase();
          const target = dimToScore[code];
          if (target == null) continue;
          // Honour reverse scoring on the way back to raw.
          const min = q.minScale ?? 1;
          const max = q.maxScale ?? 5;
          const raw = q.isReverseScored ? max + min - Math.round(target) : Math.round(target);
          answersData.push({
            submissionId: '__placeholder__',
            questionId: q.id,
            rawValue: String(raw),
            numericValue: raw,
            textValue: null,
          });
        }
        if (answersData.length === 0) continue;
        const submission = await prisma.submission.create({
          data: {
            campaignId,
            questionnaireId: campaign.questionnaireId,
            anonymousParticipantKey: `manual-${Date.now()}-${i}`,
            teamId: null,
            roleLabel: body.label ?? 'Manual entry',
            submittedAt: new Date(),
            status: 'COMPLETED',
          },
        });
        await prisma.answer.createMany({
          data: answersData.map((a) => ({ ...a, submissionId: submission.id })),
        });
        created.push(submission.id);
      }

      recordAudit(req, 'results.manual', 'SurveyCampaign', campaignId, {
        respondents,
        dims: dimToScore,
      });

      res.status(201).json({ created: created.length, dims: dimToScore });
    } catch (e) {
      if (e instanceof ZodError) return next(new HttpError(422, 'Invalid manual payload', e.flatten()));
      next(e);
    }
  },
);
