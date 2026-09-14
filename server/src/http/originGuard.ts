import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { forbidden } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Origins allowed to make cross-origin writes (comma separated ALLOWED_ORIGINS). */
const allowList = new Set(
  config.allowedOrigins.map((origin) => {
    try {
      return new URL(origin).host.toLowerCase();
    } catch {
      return origin.toLowerCase();
    }
  }),
);

/**
 * Blocks cross-site state-changing requests. Session cookies are SameSite=Lax,
 * and this additionally rejects writes whose Origin does not match the host the
 * request was made to — a cheap, dependency-free CSRF defence.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Same-origin browser requests and server-to-server calls omit Origin.
    next();
    return;
  }
  try {
    const host = new URL(String(origin)).host;
    if (host === String(req.headers.host).toLowerCase() || allowList.has(host.toLowerCase())) {
      next();
      return;
    }
  } catch {
    next(forbidden('Blocked request from an unexpected origin.'));
    return;
  }
  next(forbidden('Blocked request from an unexpected origin.'));
}
