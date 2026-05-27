import type { Request } from 'express';
import { prisma } from '../prisma/client.js';

/**
 * Fire-and-forget audit log entry. Failures are swallowed so business
 * logic is never blocked by the audit pipeline.
 */
export function recordAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null = null,
  metadata?: Record<string, unknown>,
): void {
  const actorUserId = req.auth?.sub ?? null;
  const actorRole = req.auth?.role ?? null;
  const ip =
    (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    null;
  const ua = req.headers['user-agent']?.toString().slice(0, 500) ?? null;

  void prisma.auditLog
    .create({
      data: {
        actorUserId,
        actorRole,
        action,
        entityType,
        entityId,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: ip,
        userAgent: ua,
      },
    })
    .catch(() => undefined);
}
