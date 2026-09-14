import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execMany, execute, getDriver, query, queryOne } from './index.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         serial PRIMARY KEY,
      name       text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function listMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = await fs.readdir(dir);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Applies every not-yet-applied `*.sql` file from server/migrations in
 * filename order. Safe to run on every boot.
 */
export async function runMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  await getDriver();
  await ensureMigrationsTable();
  const files = await listMigrations(dir);
  const applied: string[] = [];

  for (const file of files) {
    const existing = await queryOne<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE name = $1',
      [file],
    );
    if (existing) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await execMany(sql);
    await execute('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    applied.push(file);
  }
  return applied;
}

export async function migrationStatus(): Promise<{ name: string; appliedAt: string }[]> {
  await ensureMigrationsTable();
  return query<{ name: string; appliedAt: string }>(
    'SELECT name, applied_at AS "appliedAt" FROM schema_migrations ORDER BY id',
  );
}
