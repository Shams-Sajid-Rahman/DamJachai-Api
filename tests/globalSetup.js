// Runs once before all tests: creates the test database if needed, rebuilds the schema and loads the seed.
import pg from 'pg';
import { applyTestEnv } from './testEnv.js';

export default async function globalSetup() {
  applyTestEnv();
  const url = new URL(process.env.DATABASE_URL);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to run tests against "${dbName}": the name must end with _test`);

  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)} ENCODING 'UTF8' TEMPLATE template0`);
  await client.end();

  // Imported only now, so these modules read the test environment.
  const { query, closePool } = await import('../src/config/db.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  const { runSeed } = await import('../src/db/seeds/seed.js');
  await query('DROP SCHEMA IF EXISTS public CASCADE');
  await query('CREATE SCHEMA public');
  await runMigrations({ log: () => {} });
  const log = console.log;
  const table = console.table;
  console.log = () => {};
  console.table = () => {};
  try {
    await runSeed();
  } finally {
    console.log = log;
    console.table = table;
  }
  await closePool();
}
