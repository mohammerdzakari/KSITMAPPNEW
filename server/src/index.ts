import { config } from './config.js';
import { createApp } from './app.js';
import { bootstrap } from './db/bootstrap.js';
import { closeDatabase, databaseDriverName } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { purgeExpiredSessions } from './auth/session.js';

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length > 0) {
    console.log(`[db] Applied migrations: ${applied.join(', ')}`);
  }
  await bootstrap();

  const driver = await databaseDriverName();
  console.log(
    `[db] Using ${driver === 'embedded' ? `embedded PostgreSQL (data dir: ${config.pgDataDir})` : 'PostgreSQL at DATABASE_URL'}`,
  );

  await purgeExpiredSessions();
  const cleanup = setInterval(() => {
    purgeExpiredSessions().catch((err) => console.error('[sessions] cleanup failed', err));
  }, 60 * 60 * 1000);
  cleanup.unref();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[api] KSITM API listening on http://${config.host}:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down…`);
    clearInterval(cleanup);
    server.close();
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] Failed to start:', err);
  process.exit(1);
});
