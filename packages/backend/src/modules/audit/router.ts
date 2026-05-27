import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../middleware/error.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

const querySchema = z.object({
  actorUserId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

auditRouter.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Invalid query', parsed.error.flatten());
    const q = parsed.data;

    const where: Record<string, unknown> = {};
    if (q.actorUserId) where.actorUserId = q.actorUserId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.action) where.action = q.action;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const items = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const nextCursor = items.length > q.limit ? items[q.limit].id : null;
    const trimmed = items.slice(0, q.limit);

    // Decorate with actor name/email if known.
    const actorIds = Array.from(
      new Set(trimmed.map((r) => r.actorUserId).filter((x): x is string => !!x)),
    );
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    res.json({
      items: trimmed.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorUserId: r.actorUserId,
        actorRole: r.actorRole,
        actor: r.actorUserId ? actorMap.get(r.actorUserId) ?? null : null,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        metadata: r.metadata ? safeParse(r.metadata) : null,
      })),
      nextCursor,
    });
  } catch (e) {
    next(e);
  }
});

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
