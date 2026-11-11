// Applies numbered .sql files from db/migrations in order, each one in its own transaction.
// Applied files are recorded in schema_migrations with a checksum.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from '../config/db.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_ID = 7_202_611; // any constant number; stops two runners from working at the same time

const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

async function listMigrationFiles() {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
}

export async function runMigrations({ log = console.log } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));
    let count = 0;

    for (const file of await listMigrationFiles()) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const sum = checksum(sql);

      if (applied.has(file)) {
        if (applied.get(file) !== sum) {
          log(`! ${file} was changed after it was applied. Create a new migration instead.`);
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, sum]);
        await client.query('COMMIT');
        log(`✓ applied ${file}`);
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }

    log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Run directly: `npm run migrate`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .catch((err) => {
      if (err.code === '3D000') {
        console.error('The database does not exist yet. Run `npm run db:create` first.');
      } else {
        console.error(err.message);
      }
      process.exitCode = 1;
    })
    .finally(closePool);
}
