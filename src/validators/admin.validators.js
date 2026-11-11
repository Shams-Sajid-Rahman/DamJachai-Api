import { z } from 'zod';
import { id, money, optionalText, pagination, queryBoolean, slug } from './common.js';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const nullableText = (max) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const nullableMoney = z.preprocess(blankToNull, money.nullable());
const nullableId = z.preprocess(blankToNull, id.nullable());
const sortOrder = z.enum(['asc', 'desc']).default('asc');
const status = z.enum(['active', 'hidden']);
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), id.optional());

const nonEmpty = (schema) =>
  schema.refine((obj) => Object.values(obj).some((v) => v !== undefined), 'Send at least one field to update');

// ---------- Locations and categories ----------

const bilingualName = {
  nameEn: z.string().trim().min(1, 'English name is required').max(100),
  nameBn: z.string().trim().min(1, 'Bangla name is required').max(100),
};

export const cityCreate = z.object({ ...bilingualName, slug: slug.optional() });
export const cityUpdate = nonEmpty(cityCreate.partial());

export const areaCreate = z.object({ cityId: id, ...bilingualName, slug: slug.optional() });
export const areaUpdate = nonEmpty(areaCreate.partial());

export const categoryCreate = z.object({ ...bilingualName, slug: slug.optional() });
export const categoryUpdate = nonEmpty(categoryCreate.partial());

export const simpleListQuery = z.object({
  q: optionalText(100),
  cityId: optionalId,
  sort: z.enum(['name', 'created', 'count']).default('name'),
  order: sortOrder,
  ...pagination,
});

// ---------- Labs ----------

const labFields = {
  name: z.string().trim().min(2).max(150),
  slug: slug.optional(),
  cityId: id,
  areaId: nullableId.optional(),
  address: nullableText(300).optional(),
  phone: nullableText(40).optional(),
  website: z.preprocess(blankToNull, z.url({ protocol: /^https?$/ }).max(300).nullable()).optional(),
  latitude: z.preprocess(blankToNull, z.coerce.number().min(-90).max(90).nullable()).optional(),
  longitude: z.preprocess(blankToNull, z.coerce.number().min(-180).max(180).nullable()).optional(),
  openingHours: nullableText(200).optional(),
  isAccredited: z.boolean().optional(),
  accreditationNote: nullableText(500).optional(),
  homeCollection: z.boolean().optional(),
  homeCollectionFee: z.preprocess(blankToNull, z.coerce.number().min(0).max(100000).nullable()).optional(),
  isSample: z.boolean().optional(),
  status: status.optional(),
};

export const labCreate = z.object(labFields);
export const labUpdate = nonEmpty(z.object(labFields).partial());

export const labListQuery = z.object({
  q: optionalText(100),
  cityId: optionalId,
  areaId: optionalId,
  status: status.optional(),
  sort: z.enum(['name', 'created', 'updated', 'prices', 'oldest_verified']).default('name'),
  order: sortOrder,
  ...pagination,
});

// ---------- Tests ----------

const testFields = {
  categoryId: id,
  nameEn: z.string().trim().min(2).max(200),
  nameBn: z.string().trim().min(1).max(200),
  slug: slug.optional(),
  description: nullableText(2000).optional(),
  sampleType: nullableText(100).optional(),
  preparationNote: nullableText(1000).optional(),
  status: status.optional(),
  aliases: z.array(z.string().trim().min(1).max(150)).max(30).optional(),
};

export const testCreate = z.object(testFields);
export const testUpdate = nonEmpty(z.object(testFields).partial());

export const testListQuery = z.object({
  q: optionalText(100),
  categoryId: optionalId,
  status: status.optional(),
  sort: z.enum(['name', 'created', 'prices', 'searches']).default('name'),
  order: sortOrder,
  ...pagination,
});

// ---------- Lab prices ----------

const reportHours = z.preprocess(blankToNull, z.coerce.number().int().min(1).max(2160).nullable());

export const labTestCreate = z
  .object({
    labId: id,
    testId: id,
    price: money,
    discountedPrice: nullableMoney.optional(),
    reportHours: reportHours.optional(),
  })
  .refine((v) => v.discountedPrice == null || v.discountedPrice <= v.price, {
    message: 'Discounted price cannot be higher than the price',
    path: ['discountedPrice'],
  });

export const labTestUpdate = nonEmpty(
  z.object({
    price: money.optional(),
    discountedPrice: nullableMoney.optional(),
    reportHours: reportHours.optional(),
  }),
);

export const labTestListQuery = z.object({
  q: optionalText(100),
  labId: optionalId,
  testId: optionalId,
  source: z.enum(['admin', 'user_report', 'import']).optional(),
  staleDays: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(3650).optional()),
  sort: z.enum(['updated', 'price', 'verified', 'lab', 'test']).default('updated'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...pagination,
});

export const importBody = z.object({
  confirm: queryBoolean.default(false),
});

// ---------- Users ----------

export const userListQuery = z.object({
  q: optionalText(100),
  role: z.enum(['user', 'admin']).optional(),
  isActive: queryBoolean,
  sort: z.enum(['created', 'name', 'email']).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...pagination,
});

export const userRoleBody = z.object({ role: z.enum(['user', 'admin']) });
export const userStatusBody = z.object({ isActive: z.boolean() });

// ---------- Moderation ----------

export const moderationListQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  q: optionalText(100),
  labId: optionalId,
  order: z.enum(['asc', 'desc']).default('asc'),
  ...pagination,
});

export const moderationNoteBody = z.object({
  note: z.preprocess(blankToNull, z.string().trim().max(1000).nullable()).optional(),
});

export const approveReportBody = z.object({
  note: z.preprocess(blankToNull, z.string().trim().max(1000).nullable()).optional(),
  // Lets the admin correct the reported price before applying it.
  price: money.optional(),
});

// ---------- Audit logs ----------

export const auditListQuery = z.object({
  entity: optionalText(50),
  action: optionalText(50),
  adminId: optionalId,
  entityId: optionalId,
  from: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().optional()),
  to: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().optional()),
  ...pagination,
});
