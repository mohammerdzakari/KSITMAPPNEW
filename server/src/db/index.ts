/**
 * Database access layer.
 *
 * The application speaks plain PostgreSQL. Two interchangeable drivers are
 * supported:
 *
 *  - `postgres`  — a real managed/self-hosted PostgreSQL server (production).
 *                  Enabled by setting DATABASE_URL.
 *  - `embedded`  — PGlite, the real PostgreSQL engine compiled to WebAssembly,
 *                  persisting to a local data directory. Enabled automatically
 *                  when DATABASE_URL is absent, so `npm run dev` needs no setup.
 *
 * Both drivers expose the same tiny surface (query + transaction) and the same
 * value mapping, so every SQL statement in this codebase is portable.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../config.js';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** Low-level driver call: resolves with the full result (rows + rowCount). */
export type QueryFn = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

/** Query helper handed to transaction callbacks: resolves with rows only. */
export type TxQuery = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  name: 'postgres' | 'embedded';
  query: QueryFn;
  /** Runs a multi-statement SQL script (used for migrations). */
  execMany: (sql: string) => Promise<void>;
  transaction<T>(fn: (query: TxQuery) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * While a transaction is running, every `query`/`execute` call made anywhere in
 * the current async call stack is routed to the transaction's own connection.
 * Without this, a service helper called from inside a transaction would open a
 * second connection and deadlock against the open transaction.
 */
const activeQuery = new AsyncLocalStorage<QueryFn>();

let driver: Driver | null = null;

async function createPostgresDriver(connectionString: string): Promise<Driver> {
  const pg = await import('pg');
  // Keep value mapping identical to the embedded driver.
  const NUMERIC = 1700;
  const INT8 = 20;
  pg.default.types.setTypeParser(NUMERIC, (v) => (v === null ? null : Number.parseFloat(v)));
  pg.default.types.setTypeParser(INT8, (v) => (v === null ? null : Number.parseInt(v, 10)));

  const pool = new pg.default.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => {
    console.error('[db] idle client error', err.message);
  });

  const query: QueryFn = async (sql, params = []) => {
    const res = await pool.query(sql, params as never[]);
    return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
  };

  return {
    name: 'postgres',
    query,
    // No params => node-postgres uses the simple protocol, which accepts
    // several statements in one round trip.
    async execMany(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bound: QueryFn = async (sql, params = []) => {
          const res = await client.query(sql, params as never[]);
          return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
        };
        const rowsOnly: TxQuery = async (sql, params = []) => (await bound(sql, params)).rows as never[];
        const result = await activeQuery.run(bound, () => fn(rowsOnly));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function createEmbeddedDriver(dataDir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dataDir);
  await db.waitReady;

  const query: QueryFn = async (sql, params = []) => {
    const res = await db.query(sql, params as never[]);
    return { rows: res.rows as never[], rowCount: res.affectedRows ?? res.rows.length };
  };

  return {
    name: 'embedded',
    query,
    async execMany(sql) {
      await db.exec(sql);
    },
    async transaction(fn) {
      return db.transaction(async (tx) => {
        const bound: QueryFn = async (sql, params = []) => {
          const res = await tx.query(sql, params as never[]);
          return { rows: res.rows as never[], rowCount: res.affectedRows ?? res.rows.length };
        };
        const rowsOnly: TxQuery = async (sql, params = []) => (await bound(sql, params)).rows as never[];
        return activeQuery.run(bound, () => fn(rowsOnly));
      }) as Promise<never>;
    },
    async close() {
      await db.close();
    },
  };
}

export async function getDriver(): Promise<Driver> {
  if (driver) return driver;
  driver = config.databaseUrl
    ? await createPostgresDriver(config.databaseUrl)
    : await createEmbeddedDriver(config.pgDataDir);
  return driver;
}

async function rawQuery<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
  const scoped = activeQuery.getStore();
  if (scoped) return scoped<T>(sql, params);
  return (await getDriver()).query<T>(sql, params);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await rawQuery<T>(sql, params);
  return res.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Runs a whole SQL script (multiple statements). Migrations use this. */
export async function execMany(sql: string): Promise<void> {
  await (await getDriver()).execMany(sql);
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const res = await rawQuery(sql, params);
  return res.rowCount;
}

export async function transaction<T>(fn: (query: TxQuery) => Promise<T>): Promise<T> {
  return (await getDriver()).transaction(fn);
}

export async function closeDatabase(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function databaseDriverName(): Promise<'postgres' | 'embedded'> {
  return (await getDriver()).name;
}
