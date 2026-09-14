import type { NextFunction, Request, Response } from 'express';
import { tooMany } from './errors.js';

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => t > cutoff);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/**
 * Small in-memory sliding-window limiter. Enough to blunt credential stuffing
 * on the auth endpoints; a single-process deployment is the assumed topology.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${options.key ?? req.path}:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < options.windowMs);
    bucket.hits.push(now);
    buckets.set(key, bucket);
    if (bucket.hits.length > options.max) {
      next(tooMany(`Too many requests. Please try again in a minute.`));
      return;
    }
    next();
  };
}

export { clientIp };
