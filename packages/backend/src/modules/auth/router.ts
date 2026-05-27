import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AuthUserSchema,
  LoginSchema,
  RefreshSchema,
  UserRoleEnum,
  type AuthUser,
} from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { recordAudit } from '../../lib/audit.js';
import { signAccess, signRefresh, verifyRefresh } from './jwt.js';
import { requireAuth } from './middleware.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function toAuthUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string | null;
}): AuthUser {
  return AuthUserSchema.parse({
    id: u.id,
    name: u.name,
    email: u.email,
    role: UserRoleEnum.parse(u.role),
    companyId: u.companyId,
  });
}

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash || user.status !== 'ACTIVE') {
      recordAudit(req, 'auth.login.failed', 'User', null, { email: email.toLowerCase() });
      throw new HttpError(401, 'Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordAudit(req, 'auth.login.failed', 'User', user.id, { email: user.email });
      throw new HttpError(401, 'Invalid credentials');
    }

    const authUser = toAuthUser(user);
    recordAudit(req, 'auth.login.success', 'User', user.id);
    res.json({
      accessToken: signAccess(authUser),
      refreshToken: signRefresh(authUser),
      user: authUser,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return next(new HttpError(400, 'Invalid request body', (err as { issues?: unknown }).issues));
    }
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const claims = verifyRefresh(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Invalid refresh token');
    const authUser = toAuthUser(user);
    res.json({
      accessToken: signAccess(authUser),
      refreshToken: signRefresh(authUser),
      user: authUser,
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
      return next(new HttpError(401, 'Invalid or expired refresh token'));
    }
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user: toAuthUser(user) });
  } catch (err) {
    next(err);
  }
});
