import { Router } from 'express';
import { ZodError } from 'zod';
import {
  CompanyCreateSchema,
  CompanyUpdateSchema,
  TeamCreateSchema,
  TeamUpdateSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

function handleZod(err: unknown): never {
  if (err instanceof ZodError) {
    throw new HttpError(400, 'Invalid request body', err.issues);
  }
  throw err;
}

function normaliseOptional(v: unknown): string | null | undefined {
  if (v === '' || v === null) return null;
  return v as string | undefined;
}

// ─── Companies ─────────────────────────────────────────────────────────
companiesRouter.get('/', async (req, res, next) => {
  try {
    const where =
      req.auth!.role === 'SUPER_ADMIN'
        ? {}
        : { id: req.auth!.companyId ?? '__none__' };
    const items = await prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

companiesRouter.post('/', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = CompanyCreateSchema.parse(req.body);
    const created = await prisma.company.create({
      data: {
        name: body.name,
        industry: normaliseOptional(body.industry) ?? null,
        website: normaliseOptional(body.website) ?? null,
        contactEmail: normaliseOptional(body.contactEmail) ?? null,
        allowNamedReporting: body.allowNamedReporting ?? false,
      },
    });
    recordAudit(req, 'company.create', 'Company', created.id, { name: created.name });
    res.status(201).json(created);
  } catch (e) {
    try { handleZod(e); } catch (h) { return next(h); }
  }
});

companiesRouter.get('/:id', async (req, res, next) => {
  try {
    assertCompanyAccess(req.auth, req.params.id);
    const item = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!item) throw new HttpError(404, 'Company not found');
    res.json(item);
  } catch (e) { next(e); }
});

companiesRouter.patch(
  '/:id',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      assertCompanyAccess(req.auth, req.params.id);
      const body = CompanyUpdateSchema.parse(req.body);
      const updated = await prisma.company.update({
        where: { id: req.params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.industry !== undefined ? { industry: normaliseOptional(body.industry) } : {}),
          ...(body.website !== undefined ? { website: normaliseOptional(body.website) } : {}),
          ...(body.contactEmail !== undefined ? { contactEmail: normaliseOptional(body.contactEmail) } : {}),
          ...(body.allowNamedReporting !== undefined ? { allowNamedReporting: body.allowNamedReporting } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      recordAudit(req, 'company.update', 'Company', updated.id);
      res.json(updated);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

companiesRouter.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    await prisma.company.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED' },
    });
    recordAudit(req, 'company.archive', 'Company', req.params.id);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ─── Teams (nested under company) ──────────────────────────────────────
companiesRouter.get('/:id/teams', async (req, res, next) => {
  try {
    assertCompanyAccess(req.auth, req.params.id);
    const items = await prisma.team.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

companiesRouter.post(
  '/:id/teams',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      assertCompanyAccess(req.auth, req.params.id);
      const body = TeamCreateSchema.parse(req.body);
      const created = await prisma.team.create({
        data: {
          companyId: req.params.id,
          name: body.name,
          description: normaliseOptional(body.description) ?? null,
          managerName: normaliseOptional(body.managerName) ?? null,
        },
      });
      res.status(201).json(created);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

companiesRouter.patch(
  '/:id/teams/:teamId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      assertCompanyAccess(req.auth, req.params.id);
      const body = TeamUpdateSchema.parse(req.body);
      const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
      if (!team || team.companyId !== req.params.id) {
        throw new HttpError(404, 'Team not found');
      }
      const updated = await prisma.team.update({
        where: { id: req.params.teamId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: normaliseOptional(body.description) } : {}),
          ...(body.managerName !== undefined ? { managerName: normaliseOptional(body.managerName) } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      res.json(updated);
    } catch (e) {
      try { handleZod(e); } catch (h) { return next(h); }
    }
  },
);

companiesRouter.delete(
  '/:id/teams/:teamId',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      assertCompanyAccess(req.auth, req.params.id);
      const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
      if (!team || team.companyId !== req.params.id) {
        throw new HttpError(404, 'Team not found');
      }
      await prisma.team.update({
        where: { id: req.params.teamId },
        data: { status: 'ARCHIVED' },
      });
      res.status(204).end();
    } catch (e) { next(e); }
  },
);
