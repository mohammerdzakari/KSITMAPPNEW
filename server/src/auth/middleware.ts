import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, readSession } from './session.js';
import { forbidden, unauthorized } from '../http/errors.js';
import type { Role, SessionUser } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: SessionUser;
      currentSessionId?: string;
      sessionToken?: string;
    }
  }
}

/** Populates req.currentUser from the session cookie when one is present. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookieHeader = req.headers.cookie;
  const token = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!token) {
    next();
    return;
  }
  const session = await readSession(token);
  if (session) {
    req.currentUser = session.user;
    req.currentSessionId = session.sessionId;
    req.sessionToken = token;
  }
  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionToken?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    next(unauthorized());
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.currentUser.role)) {
      next(forbidden('Your account does not have access to this area.'));
      return;
    }
    next();
  };
}
