import type { Request } from 'express';
import type { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Express 5 types route params as `string | string[]`; this coerces them back to
 * a single string so handlers stay readable.
 */
export function idParam(req: Request, key = 'id'): string {
  const raw = (req.params as Record<string, unknown>)[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Validates unknown input against a zod schema and returns typed data.
 * Field level problems are returned as a 400 with a `fields` map so the UI can
 * show them next to the right input.
 */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const firstMessage = result.error.issues[0]?.message ?? 'Invalid request.';
    throw badRequest(firstMessage, { fields });
  }
  return result.data;
}

export function parsePositiveInt(raw: unknown, fallback = 0): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseBoolean(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === '1' || raw === 1;
}
