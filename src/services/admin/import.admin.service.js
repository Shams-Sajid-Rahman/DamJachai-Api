// CSV import of lab prices: first a preview with per-row errors, then an explicit confirm.
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { audited } from './helpers.js';
import { upsertPrice } from './prices.admin.service.js';

export const IMPORT_MAX_ROWS = 2000;
const REQUIRED_HEADERS = ['lab_slug', 'test_slug', 'price'];
const OPTIONAL_HEADERS = ['discounted_price', 'report_hours'];

export const CSV_TEMPLATE = [
  'lab_slug,test_slug,price,discounted_price,report_hours',
  'sample-lab-1,cbc,450,400,6',
  'sample-lab-2,hba1c,1200,,24',
].join('\n');

const blank = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

const rowSchema = z.object({
  lab_slug: z.string().min(1, 'lab_slug is required'),
  test_slug: z.string().min(1, 'test_slug is required'),
  price: z.coerce.number({ message: 'price must be a number' }).positive('price must be greater than 0').max(9_999_999),
  discounted_price: z.coerce.number({ message: 'discounted_price must be a number' }).positive().max(9_999_999).nullable(),
  report_hours: z.coerce.number({ message: 'report_hours must be a whole number' }).int('report_hours must be a whole number').min(1).max(2160).nullable(),
});

function parseCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      columns: (header) => header.map((h) => String(h).trim().toLowerCase()),
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      to: IMPORT_MAX_ROWS + 1,
    });
  } catch (err) {
    throw ApiError.badRequest(`Could not read the CSV file: ${err.message}`);
  }

  if (!records.length) throw ApiError.badRequest('The CSV file has no data rows');
  if (records.length > IMPORT_MAX_ROWS) throw ApiError.badRequest(`At most ${IMPORT_MAX_ROWS} rows per import`);

  const headers = Object.keys(records[0]);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw ApiError.badRequest(`Missing columns: ${missing.join(', ')}. Expected: ${[...REQUIRED_HEADERS, ...OPTIONAL_HEADERS].join(', ')}`);
  }
  return records;
}

/** Validates every row against the database and returns the preview. Saves nothing. */
export async function buildPreview(buffer) {
  const records = parseCsv(buffer);
  const labSlugs = [...new Set(records.map((r) => blank(r.lab_slug)?.toLowerCase()).filter(Boolean))];
  const testSlugs = [...new Set(records.map((r) => blank(r.test_slug)?.toLowerCase()).filter(Boolean))];

  const [labs, tests] = await Promise.all([
    query('SELECT id, slug, name, status FROM labs WHERE slug = ANY($1::text[])', [labSlugs]),
    query('SELECT id, slug, name_en, status FROM tests WHERE slug = ANY($1::text[])', [testSlugs]),
  ]);
  const labBySlug = new Map(labs.rows.map((l) => [l.slug, l]));
  const testBySlug = new Map(tests.rows.map((t) => [t.slug, t]));

  const labIds = labs.rows.map((l) => l.id);
  const existing = labIds.length
    ? await query('SELECT lab_id, test_id, price, discounted_price, report_hours FROM lab_tests WHERE lab_id = ANY($1::int[])', [labIds])
    : { rows: [] };
  const existingByKey = new Map(existing.rows.map((e) => [`${e.lab_id}:${e.test_id}`, e]));

  const seen = new Map();
  const rows = records.map((record, index) => {
    const rowNumber = index + 2; // line 1 is the header
    const raw = {
      lab_slug: blank(record.lab_slug)?.toLowerCase() ?? '',
      test_slug: blank(record.test_slug)?.toLowerCase() ?? '',
      price: blank(record.price),
      discounted_price: blank(record.discounted_price),
      report_hours: blank(record.report_hours),
    };
    const errors = [];
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) errors.push(...parsed.error.issues.map((i) => i.message));

    const lab = labBySlug.get(raw.lab_slug);
    const test = testBySlug.get(raw.test_slug);
    if (raw.lab_slug && !lab) errors.push(`Unknown lab "${raw.lab_slug}"`);
    if (raw.test_slug && !test) errors.push(`Unknown test "${raw.test_slug}"`);

    const value = parsed.success ? parsed.data : null;
    if (value?.discounted_price != null && value.discounted_price > value.price) {
      errors.push('discounted_price cannot be higher than price');
    }

    const key = lab && test ? `${lab.id}:${test.id}` : null;
    if (key) {
      if (seen.has(key)) errors.push(`Duplicate of row ${seen.get(key)}`);
      else seen.set(key, rowNumber);
    }

    const current = key ? existingByKey.get(key) : null;
    let action = 'error';
    if (!errors.length) {
      if (!current) action = 'create';
      else if (
        current.price === value.price &&
        current.discounted_price === value.discounted_price &&
        current.report_hours === value.report_hours
      ) action = 'unchanged';
      else action = 'update';
    }

    return {
      row: rowNumber,
      labSlug: raw.lab_slug,
      testSlug: raw.test_slug,
      labId: lab?.id ?? null,
      testId: test?.id ?? null,
      labName: lab?.name ?? null,
      testName: test?.name_en ?? null,
      price: value?.price ?? raw.price,
      discountedPrice: value?.discounted_price ?? null,
      reportHours: value?.report_hours ?? null,
      oldPrice: current?.price ?? null,
      action,
      errors,
    };
  });

  const count = (a) => rows.filter((r) => r.action === a).length;
  // Rows with errors come first, so the admin sees them straight away.
  rows.sort((a, b) => (b.errors.length > 0) - (a.errors.length > 0) || a.row - b.row);

  return {
    summary: {
      total: rows.length,
      valid: rows.length - count('error'),
      errors: count('error'),
      create: count('create'),
      update: count('update'),
      unchanged: count('unchanged'),
    },
    rows,
  };
}

/** Saves every valid row in one transaction. Rows with errors are skipped. */
export async function applyImport(adminId, buffer, { fileName } = {}) {
  const preview = await buildPreview(buffer);
  const valid = preview.rows.filter((r) => r.action !== 'error');
  if (!valid.length) throw ApiError.badRequest('There are no valid rows to import', preview.summary);

  const applied = await audited(adminId, { action: 'import', entity: 'lab_test' }, async (client) => {
    const counts = { create: 0, update: 0, unchanged: 0 };
    for (const r of valid) {
      const out = await upsertPrice(client, {
        labId: r.labId,
        testId: r.testId,
        price: r.price,
        discountedPrice: r.discountedPrice,
        reportHours: r.reportHours,
        source: 'import',
        adminId,
      });
      counts[out.action] += 1;
    }
    return {
      result: { ...counts, skipped: preview.summary.errors },
      details: { fileName: fileName || null, ...counts, skipped: preview.summary.errors, rows: preview.summary.total },
    };
  });

  return { applied, preview };
}
