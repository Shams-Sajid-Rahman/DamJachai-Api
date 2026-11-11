// Shared by Jest's globalSetup and every test file.
// Tests use a separate database named "<your database>_test", derived from DATABASE_URL, or TEST_DATABASE_URL if set.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });

export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) in server/.env to run the tests');
  const url = new URL(process.env.DATABASE_URL);
  const name = url.pathname.replace(/^\//, '') || 'damjachai';
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

/** Sets the environment for tests. It must run before src/config/env.js is imported. */
export function applyTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret-0123';
  process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret-0123';
  process.env.ADMIN_NAME = 'Test Admin';
  process.env.ADMIN_EMAIL = 'admin.test@example.com';
  process.env.ADMIN_PASSWORD = 'admin-test-password-123';
  process.env.CLIENT_URL = 'http://localhost:5173';
}

export const ADMIN = { email: 'admin.test@example.com', password: 'admin-test-password-123' };
