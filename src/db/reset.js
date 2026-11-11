// DEVELOPMENT ONLY: drops every table, re-runs all migrations, then seeds.
import { env } from '../config/env.js';
import { query, closePool } from '../config/db.js';
import { runMigrations } from './migrate.js';
import { runSeed } from './seeds/seed.js';

async function reset() {
  if (env.isProduction) throw new Error('db:reset is disabled when NODE_ENV=production');

  console.log('Dropping schema "public"...');
  await query('DROP SCHEMA IF EXISTS public CASCADE');
  await query('CREATE SCHEMA public');
  await runMigrations();
  await runSeed();
}

reset()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
