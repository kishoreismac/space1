import { Router } from 'express';
import { z, ZodError } from 'zod';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { toPublicQuestionnaire } from './service.js';

export const questionnairesRouter = Router();
questionnairesRouter.use(requireAuth);

const QuestionTypeEnum = z.enum(['LIKERT', 'OPEN_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE']);

const QuestionCreateSchema = z.object({
  dimensionCode: z.string().min(1).max(8),
  questionNumber: z.number().int().positive().optional(),
  questionText: z.string().min(3).max(2000),
  questionType: QuestionTypeEnum.default('LIKERT'),
  blockerSignal: z.string().max(280).nullable().optional(),
  isReverseScored: z.boolean().default(false),
  isRequired: z.boolean().default(true),
  minScale: z.number().int().min(0).max(20).nullable().optional(),
  maxScale: z.number().int().min(1).max(20).nullable().optional(),
  lowLabel: z.string().max(120).nullable().optional(),
  highLabel: z.string().max(120).nullable().optional(),
  tooltipText: z.string().max(500).nullable().optional(),
});

const QuestionUpdateSchema = QuestionCreateSchema.partial();

function assertCanEditQuestionnaire(role: string, companyId: string | null, qCompanyId: string | null) {
  if (role === 'SUPER_ADMIN') return;
  if (role === 'COMPANY_ADMIN' && qCompanyId && qCompanyId === companyId) return;
  throw new HttpError(403, 'Not allowed to edit this questionnaire');
}

questionnairesRouter.get('/', async (req, res, next) => {
  try {
    const role = req.auth!.role;
    const companyId = req.auth!.companyId;
    const where =
      role === 'SUPER_ADMIN'
        ? {}
        : { OR: [{ companyId: null }, { companyId: companyId ?? '__none__' }] };
    const items = await prisma.questionnaire.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        version: true,
        status: true,
        estimatedMinutes: true,
        isAnonymous: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

questionnairesRouter.get('/:id', async (req, res, next) => {
  try {
    const q = await prisma.questionnaire.findUnique({
      where: { id: req.params.id },
      include: {
        questions: {
          orderBy: { questionNumber: 'asc' },
          include: { dimension: true },
        },
        dimensions: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!q) throw new HttpError(404, 'Questionnaire not found');
    res.json(toPublicQuestionnaire(q));
  } catch (e) { next(e); }
});

// ─── Question CRUD (admin only) ────────────────────────────────────────

questionnairesRouter.post(
  '/:id/questions',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const body = QuestionCreateSchema.parse(req.body);
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id: req.params.id },
        include: { dimensions: true, questions: { select: { questionNumber: true } } },
      });
      if (!questionnaire) throw new HttpError(404, 'Questionnaire not found');
      assertCanEditQuestionnaire(req.auth!.role, req.auth!.companyId ?? null, questionnaire.companyId);

      const dim = questionnaire.dimensions.find(
        (d) => d.code.toUpperCase() === body.dimensionCode.toUpperCase(),
      );
      if (!dim) throw new HttpError(400, `Dimension ${body.dimensionCode} not found on questionnaire`);

      const used = new Set(questionnaire.questions.map((q) => q.questionNumber));
      let questionNumber = body.questionNumber;
      if (!questionNumber) {
        questionNumber = 1;
        while (used.has(questionNumber)) questionNumber++;
      } else if (used.has(questionNumber)) {
        throw new HttpError(409, `Question number ${questionNumber} already in use`);
      }

      const created = await prisma.question.create({
        data: {
          questionnaireId: questionnaire.id,
          dimensionId: dim.id,
          questionNumber,
          questionText: body.questionText,
          questionType: body.questionType,
          blockerSignal: body.blockerSignal ?? null,
          isReverseScored: body.isReverseScored,
          isRequired: body.isRequired,
          minScale: body.minScale ?? (body.questionType === 'LIKERT' ? 1 : null),
          maxScale: body.maxScale ?? (body.questionType === 'LIKERT' ? 5 : null),
          lowLabel: body.lowLabel ?? null,
          highLabel: body.highLabel ?? null,
          tooltipText: body.tooltipText ?? null,
          displayOrder: questionNumber,
        },
      });
      recordAudit(req, 'question.create', 'Question', created.id, {
        questionnaireId: questionnaire.id,
        questionNumber,
      });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ZodError) return next(new HttpError(422, 'Invalid question', e.flatten()));
      next(e);
    }
  },
);

questionnairesRouter.patch(
  '/:id/questions/:questionId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const body = QuestionUpdateSchema.parse(req.body);
      const existing = await prisma.question.findUnique({
        where: { id: req.params.questionId },
        include: { questionnaire: true },
      });
      if (!existing || existing.questionnaireId !== req.params.id) {
        throw new HttpError(404, 'Question not found');
      }
      assertCanEditQuestionnaire(
        req.auth!.role,
        req.auth!.companyId ?? null,
        existing.questionnaire.companyId,
      );

      const data: Record<string, unknown> = {};
      if (body.questionText !== undefined) data.questionText = body.questionText;
      if (body.questionType !== undefined) data.questionType = body.questionType;
      if (body.blockerSignal !== undefined) data.blockerSignal = body.blockerSignal;
      if (body.isReverseScored !== undefined) data.isReverseScored = body.isReverseScored;
      if (body.isRequired !== undefined) data.isRequired = body.isRequired;
      if (body.minScale !== undefined) data.minScale = body.minScale;
      if (body.maxScale !== undefined) data.maxScale = body.maxScale;
      if (body.lowLabel !== undefined) data.lowLabel = body.lowLabel;
      if (body.highLabel !== undefined) data.highLabel = body.highLabel;
      if (body.tooltipText !== undefined) data.tooltipText = body.tooltipText;

      if (body.dimensionCode) {
        const dim = await prisma.questionDimension.findFirst({
          where: { questionnaireId: existing.questionnaireId, code: body.dimensionCode.toUpperCase() },
        });
        if (!dim) throw new HttpError(400, `Dimension ${body.dimensionCode} not found`);
        data.dimensionId = dim.id;
      }
      if (body.questionNumber !== undefined && body.questionNumber !== existing.questionNumber) {
        const clash = await prisma.question.findFirst({
          where: {
            questionnaireId: existing.questionnaireId,
            questionNumber: body.questionNumber,
            NOT: { id: existing.id },
          },
        });
        if (clash) throw new HttpError(409, `Question number ${body.questionNumber} already in use`);
        data.questionNumber = body.questionNumber;
        data.displayOrder = body.questionNumber;
      }

      const updated = await prisma.question.update({
        where: { id: existing.id },
        data,
      });
      recordAudit(req, 'question.update', 'Question', updated.id, {
        questionnaireId: existing.questionnaireId,
        changes: Object.keys(data),
      });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return next(new HttpError(422, 'Invalid update', e.flatten()));
      next(e);
    }
  },
);

questionnairesRouter.delete(
  '/:id/questions/:questionId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const existing = await prisma.question.findUnique({
        where: { id: req.params.questionId },
        include: { questionnaire: true, _count: { select: { answers: true } } },
      });
      if (!existing || existing.questionnaireId !== req.params.id) {
        throw new HttpError(404, 'Question not found');
      }
      assertCanEditQuestionnaire(
        req.auth!.role,
        req.auth!.companyId ?? null,
        existing.questionnaire.companyId,
      );
      if (existing._count.answers > 0) {
        throw new HttpError(
          409,
          `Question has ${existing._count.answers} responses; archive instead of delete`,
        );
      }
      await prisma.question.delete({ where: { id: existing.id } });
      recordAudit(req, 'question.delete', 'Question', existing.id, {
        questionnaireId: existing.questionnaireId,
        questionNumber: existing.questionNumber,
      });
      res.status(204).end();
    } catch (e) { next(e); }
  },
);
