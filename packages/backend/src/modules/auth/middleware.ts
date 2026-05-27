import type { RequestHandler } from 'express';
import type { UserRole } from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { verifyAccess, type AccessClaims } from './jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing bearer token'));
  }
  try {
    req.auth = verifyAccess(header.slice(7));
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new HttpError(401, 'Unauthenticated'));
    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Forbidden'));
    }
    next();
  };
}

/**
 * Ensures a non-super-admin actor can only touch resources scoped to their
 * own company. SUPER_ADMIN bypasses the check.
 */
export function assertCompanyAccess(
  claims: AccessClaims | undefined,
  companyId: string,
): void {
  if (!claims) throw new HttpError(401, 'Unauthenticated');
  if (claims.role === 'SUPER_ADMIN') return;
  if (claims.companyId !== companyId) {
    throw new HttpError(403, 'Forbidden: cross-company access');
  }
}
