import { runMigrations } from '../db/migrate.js';
import { bootstrap } from '../db/bootstrap.js';
import { closeDatabase, databaseDriverName } from '../db/index.js';
import { config } from '../config.js';

async function main(): Promise<void> {
  const applied = await runMigrations();
  await bootstrap();
  console.log(
    `[migrate] driver=${await databaseDriverName()} applied=${applied.length ? applied.join(', ') : 'none (already up to date)'}`,
  );
  console.log(`[migrate] data dir: ${config.databaseUrl ? 'DATABASE_URL' : config.pgDataDir}`);
}

main()
  .then(async () => {
    await closeDatabase();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
