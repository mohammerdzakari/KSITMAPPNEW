import crypto from 'node:crypto';
import type { Response } from 'express';
import { config } from '../config.js';
import { execute, query, queryOne } from '../db/index.js';
import type { SessionUser } from '../types.js';

export const SESSION_COOKIE = 'ksitm.sid';
const TOKEN_TTL_MS = config.sessionTtlDays * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
    domain: config.cookieDomain || undefined,
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await execute(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, expiresAt, meta.userAgent ?? null, meta.ip ?? null],
  );
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/**
 * Clears the cookie. Deliberately does not pass `expires`/`maxAge` keys:
 * Express merges option objects and an explicit `undefined` would break
 * cookie serialisation.
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    domain: config.cookieDomain || undefined,
  });
}

export async function readSession(token: string | undefined): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date } | null> {
  if (!token) return null;
  const sessionId = hashToken(token);
  const row = await queryOne<SessionUser & { sessionId: string; expiresAt: Date }>(
    `SELECT s.id AS "sessionId", s.expires_at AS "expiresAt",
            u.id, u.email, u.role, u.first_name AS "firstName", u.last_name AS "lastName",
            u.avatar_file_id AS "avatarFileId", u.is_active AS "isActive"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  if (!row) return null;
  if (!row.isActive) return null;
  if (!(row.expiresAt instanceof Date)) return null;

  // Sliding window: refresh tokens that are more than half way to expiry.
  if (row.expiresAt.getTime() - Date.now() < TOKEN_TTL_MS / 2) {
    const next = new Date(Date.now() + TOKEN_TTL_MS);
    await execute('UPDATE sessions SET expires_at = $2 WHERE id = $1', [sessionId, next]);
    row.expiresAt = next;
  }
  return { user: row, sessionId, expiresAt: row.expiresAt };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await execute('DELETE FROM sessions WHERE id = $1', [hashToken(token)]);
}

export async function destroyUserSessions(userId: string, exceptToken?: string): Promise<void> {
  if (exceptToken) {
    await execute('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, hashToken(exceptToken)]);
    return;
  }
  await execute('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function purgeExpiredSessions(): Promise<number> {
  return execute('DELETE FROM sessions WHERE expires_at <= now()');
}

export async function countActiveSessions(userId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at > now()',
    [userId],
  );
  return rows[0]?.n ?? 0;
}
