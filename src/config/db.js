import pg from 'pg';
import { env } from './env.js';

const { Pool, types } = pg;

// Return NUMERIC (prices) and BIGINT (COUNT(*)) as JS numbers instead of strings.
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

let pool;

export function getPool() {
  if (!pool) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Add it to server/.env');
    }
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err));
  }
  return pool;
}

/** Run one parameterized query. Always pass values through `params`, never into `text`. */
export function query(text, params = []) {
  return getPool().query(text, params);
}

/** Run `fn(client)` inside a transaction. Commits on success and rolls back on any error. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
