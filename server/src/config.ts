import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

/**
 * The compiled bundle lives in `server/dist/**` while `tsx` runs `server/src/**`,
 * so walk up until the server package.json is found instead of assuming a depth.
 */
function findServerRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: string };
        if (pkg.name === '@ksitm/server') return dir;
      } catch {
        /* unreadable package.json — keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, '..', '..');
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = findServerRoot(here);
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

/**
 * In production a session secret is mandatory: without one the app would fall
 * back to a per-boot random value and every restart would look like a logout.
 */
let sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret) {
  if (isProduction) {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  // eslint-disable-next-line no-console
  console.warn('[config] SESSION_SECRET not set — generated an ephemeral one for development.');
}

export const config = {
  nodeEnv,
  isProduction,
  port: int('PORT', 4000),
  host: str('HOST', '0.0.0.0'),
  /** When set the server talks to a managed PostgreSQL instance. */
  databaseUrl: process.env.DATABASE_URL || '',
  /** Otherwise a real (embedded) PostgreSQL instance is used with this data dir. */
  pgDataDir: str('PGDATA_DIR', path.join(SERVER_ROOT, '.pgdata')),
  sessionSecret,
  sessionTtlDays: int('SESSION_TTL_DAYS', 7),
  cookieSecure: bool('COOKIE_SECURE', isProduction),
  cookieDomain: process.env.COOKIE_DOMAIN || '',
  publicDir: str('PUBLIC_DIR', path.join(REPO_ROOT, 'web', 'dist')),
  staffAccessCode: process.env.STAFF_ACCESS_CODE || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  allowedEmailDomains: str('ALLOWED_EMAIL_DOMAINS', 'ksitm.edu.ng')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Extra browser origins allowed to make writes when the frontend is served
   * from a different host than the API. Same-origin requests never need this.
   */
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [],
  maxUploadBytes: int('MAX_UPLOAD_BYTES', 8 * 1024 * 1024),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: str('GEMINI_MODEL', 'gemini-2.5-flash'),
  geminiBaseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
  sessionLabel: str('SESSION_LABEL', '2025/2026'),
  clientUrl: process.env.CLIENT_URL || '',
};

export type AppConfig = typeof config;
