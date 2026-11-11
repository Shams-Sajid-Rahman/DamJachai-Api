import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const secret = z.string().min(32, 'must be at least 32 characters');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: secret.optional(),
  JWT_REFRESH_SECRET: secret.optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // "lax" works when the client and API share a site (e.g. localhost:5173 and localhost:5000).
  // Use "none" (with HTTPS) if they are on different sites.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  // Used only by the seed script to create the first admin.
  ADMIN_NAME: z.string().min(1).max(100).default('Site Admin'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters').optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

const data = parsed.data;

if (data.NODE_ENV === 'production' && (!data.JWT_ACCESS_SECRET || !data.JWT_REFRESH_SECRET)) {
  console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production.');
  process.exit(1);
}

export const env = Object.freeze({
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
});
