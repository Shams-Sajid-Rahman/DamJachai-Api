// Creates the database named in DATABASE_URL if it does not exist yet.
import pg from 'pg';
import { env } from '../config/env.js';

async function createDatabase() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Add it to server/.env');

  const target = new URL(env.DATABASE_URL);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('DATABASE_URL has no database name');

  // Connect to the default maintenance database on the same server.
  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();

  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount) {
      console.log(`Database "${dbName}" already exists.`);
      return;
    }
    // Identifiers cannot be bound as parameters; escapeIdentifier quotes the name safely.
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)} ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`✓ created database "${dbName}"`);
  } finally {
    await client.end();
  }
}

createDatabase().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
