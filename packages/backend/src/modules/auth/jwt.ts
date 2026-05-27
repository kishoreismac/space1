import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole, AuthUser } from '@space/shared';
import { config } from '../../config/env.js';

export interface AccessClaims {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

export function signAccess(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl } as SignOptions,
  );
}

export function signRefresh(user: AuthUser): string {
  return jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
  } as SignOptions);
}

export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, config.jwt.secret) as AccessClaims;
}

export function verifyRefresh(token: string): { sub: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { sub: string };
}
