import { z } from 'zod';
import { id, money, optionalText, pagination, queryBoolean, slug } from './common.js';

const optionalSlug = z.preprocess((v) => (v === '' ? undefined : v), slug.optional());

export const searchTestsQuery = z.object({
  q: optionalText(100),
  category: optionalSlug,
  ...pagination,
});

export const popularQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(8),
});

export const compareQuery = z.object({
  city: optionalSlug,
  area: optionalSlug,
  homeCollection: queryBoolean,
  accredited: queryBoolean,
  minRating: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(1).max(5).optional()),
  sort: z.enum(['price_asc', 'price_desc', 'rating', 'report_time']).default('price_asc'),
});

export const priceHistoryQuery = z.object({
  labId: z.preprocess((v) => (v === '' ? undefined : v), id.optional()),
});

export const basketBody = z.object({
  testIds: z.array(id).min(1, 'Add at least one test').max(25, 'At most 25 tests per basket'),
  city: optionalSlug,
  area: optionalSlug,
  homeCollection: z.boolean().optional(),
});

export const listLabsQuery = z.object({
  q: optionalText(100),
  city: optionalSlug,
  area: optionalSlug,
  homeCollection: queryBoolean,
  accredited: queryBoolean,
  minRating: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(1).max(5).optional()),
  sort: z.enum(['name', 'rating', 'tests', 'newest']).default('name'),
  ...pagination,
});

export const areasQuery = z.object({ city: optionalSlug });

export const priceReportBody = z.object({
  labId: id,
  testId: id,
  reportedPrice: money,
  note: z.string().trim().max(1000).optional(),
});

export const reviewBody = z.object({
  labId: id,
  rating: z.coerce.number().int().min(1).max(5),
  reportOnTime: z.boolean().nullable().optional(),
  comment: z.string().trim().max(2000).optional(),
});

export const favoriteBody = z.object({ labId: id });
export const labIdParam = z.object({ labId: id });
