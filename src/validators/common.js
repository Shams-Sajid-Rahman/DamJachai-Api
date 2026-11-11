import { z } from 'zod';

/** Trims a string. An empty string becomes undefined (handy for optional query params). */
export const optionalText = (max = 200) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

/** Query-string booleans: "true", "1" and "yes" are true; "false", "0" and "no" are false. */
export const queryBoolean = z.preprocess((v) => {
  if (v === undefined || v === '' || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return v;
}, z.boolean().optional());

export const id = z.coerce.number().int().positive().max(2_147_483_647);

export const idParam = z.object({ id });

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const slugParam = z.object({ slug });

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** A Taka amount: positive, at most 2 decimals, below 10 million. */
export const money = z.coerce
  .number()
  .positive('Must be greater than 0')
  .max(9_999_999)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places');

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address'));
