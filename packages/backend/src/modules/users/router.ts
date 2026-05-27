import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { ZodError } from 'zod';
import {
  UserCreateSchema,
  UserUpdateSchema,
  PasswordResetSchema,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

function handleZod(err: unknown): never {
  if (err instanceof ZodError) throw new HttpError(400, 'Invalid request body', err.issues);
  throw err;
}

function publicUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    companyId: u.companyId,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// List — SUPER sees all, COMPANY_ADMIN sees same-company users only.
usersRouter.get(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const auth = req.auth!;
      const where =
        auth.role === 'SUPER_ADMIN'
          ? {}
          : { companyId: auth.companyId ?? '___none___' };
      const items = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      res.json({ items: items.map(publicUser) });
    } catch (e) {
      next(e);
    }
  },
);

usersRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const body = UserCreateSchema.parse(req.body);
      const auth = req.auth!;

      if (auth.role === 'COMPANY_ADMIN') {
        if (body.role === 'SUPER_ADMIN') {
          throw new HttpError(403, 'Cannot create a super-admin');
        }
        // Force scope to own company
        body.companyId = auth.companyId ?? null;
      }
      if (body.role !== 'SUPER_ADMIN' && !body.companyId) {
        throw new HttpError(400, 'companyId required for non-super-admin');
      }

      const email = body.email.toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) throw new HttpError(409, 'Email already in use');

      const created = await prisma.user.create({
        data: {
          name: body.name,
          email,
          role: body.role,
          companyId: body.role === 'SUPER_ADMIN' ? null : body.companyId ?? null,
          passwordHash: await bcrypt.hash(body.password, 10),
          status: 'ACTIVE',
        },
      });
      recordAudit(req, 'user.create', 'User', created.id, {
        email: created.email,
        role: created.role,
      });
      res.status(201).json(publicUser(created));
    } catch (e) {
      try {
        handleZod(e);
      } catch (h) {
        return next(h);
      }
    }
  },
);

usersRouter.patch(
  '/:id',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const body = UserUpdateSchema.parse(req.body);
      const auth = req.auth!;
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw new HttpError(404, 'User not found');

      if (auth.role === 'COMPANY_ADMIN') {
        if (target.companyId !== auth.companyId) throw new HttpError(403, 'Forbidden');
        if (body.role === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN') {
          throw new HttpError(403, 'Cannot modify super-admins');
        }
        // Cannot move users across companies
        if (body.companyId !== undefined && body.companyId !== auth.companyId) {
          throw new HttpError(403, 'Cannot move user to another company');
        }
      }

      // Prevent self-disabling (lockout safety)
      if (body.status === 'DISABLED' && target.id === auth.sub) {
        throw new HttpError(400, 'Cannot disable your own account');
      }

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.companyId !== undefined ? { companyId: body.companyId } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      recordAudit(req, 'user.update', 'User', updated.id, body as Record<string, unknown>);
      res.json(publicUser(updated));
    } catch (e) {
      try {
        handleZod(e);
      } catch (h) {
        return next(h);
      }
    }
  },
);

usersRouter.post(
  '/:id/reset-password',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  async (req, res, next) => {
    try {
      const body = PasswordResetSchema.parse(req.body);
      const auth = req.auth!;
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) throw new HttpError(404, 'User not found');
      if (auth.role === 'COMPANY_ADMIN') {
        if (target.companyId !== auth.companyId) throw new HttpError(403, 'Forbidden');
        if (target.role === 'SUPER_ADMIN') throw new HttpError(403, 'Forbidden');
      }
      await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: await bcrypt.hash(body.password, 10) },
      });
      recordAudit(req, 'user.password.reset', 'User', target.id);
      res.status(204).end();
    } catch (e) {
      try {
        handleZod(e);
      } catch (h) {
        return next(h);
      }
    }
  },
);
