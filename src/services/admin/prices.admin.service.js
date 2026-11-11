// Admin management of lab prices (lab_tests), including price history.
import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, orderBy, pageMeta } from '../../utils/sql.js';
import { audited, DIRECTION, ensureFound } from './helpers.js';

function mapLabTest(r) {
  return {
    id: r.id,
    labId: r.lab_id,
    testId: r.test_id,
    lab: { id: r.lab_id, name: r.lab_name, slug: r.lab_slug, status: r.lab_status },
    test: { id: r.test_id, nameEn: r.test_name_en, nameBn: r.test_name_bn, slug: r.test_slug },
    price: r.price,
    discountedPrice: r.discounted_price,
    reportHours: r.report_hours,
    lastVerifiedAt: r.last_verified_at,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const LAB_TEST_SELECT = `
  lt.*, l.name AS lab_name, l.slug AS lab_slug, l.status AS lab_status,
  t.name_en AS test_name_en, t.name_bn AS test_name_bn, t.slug AS test_slug`;

export async function listLabTests({ q, labId, testId, source, staleDays, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(l.name ILIKE ${c} OR t.name_en ILIKE ${c} OR t.name_bn ILIKE ${c} OR t.slug ILIKE ${c})`);
  }
  if (labId) where.push(`lt.lab_id = ${p.add(labId)}`);
  if (testId) where.push(`lt.test_id = ${p.add(testId)}`);
  if (source) where.push(`lt.source = ${p.add(source)}`);
  if (staleDays) where.push(`lt.last_verified_at < now() - make_interval(days => ${p.add(staleDays)})`);

  const sortCol = orderBy(
    { updated: 'lt.updated_at', price: 'lt.price', verified: 'lt.last_verified_at', lab: 'l.name', test: 't.name_en' },
    sort,
  );
  const { rows } = await query(
    `SELECT ${LAB_TEST_SELECT}, count(*) OVER () AS total
     FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, lt.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return { data: rows.map(mapLabTest), meta: pageMeta({ page, limit }, rows[0]?.total ?? 0) };
}

export async function getLabTest(id) {
  const { rows } = await query(
    `SELECT ${LAB_TEST_SELECT} FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id WHERE lt.id = $1`,
    [id],
  );
  const labTest = mapLabTest(ensureFound(rows[0], 'Price not found'));
  const history = await query(
    `SELECT ph.id, ph.old_price, ph.new_price, ph.changed_at, u.name AS changed_by_name
     FROM price_history ph LEFT JOIN users u ON u.id = ph.changed_by
     WHERE ph.lab_test_id = $1 ORDER BY ph.changed_at DESC LIMIT 100`,
    [id],
  );
  labTest.history = history.rows.map((h) => ({
    id: h.id, oldPrice: h.old_price, newPrice: h.new_price, changedAt: h.changed_at, changedBy: h.changed_by_name,
  }));
  return labTest;
}

async function assertLabAndTest(client, labId, testId) {
  const { rows } = await client.query(
    `SELECT (SELECT name FROM labs WHERE id = $1) AS lab_name, (SELECT name_en FROM tests WHERE id = $2) AS test_name`,
    [labId, testId],
  );
  if (!rows[0].lab_name) throw ApiError.badRequest('Lab does not exist', { labId: ['Lab does not exist'] });
  if (!rows[0].test_name) throw ApiError.badRequest('Test does not exist', { testId: ['Test does not exist'] });
  return rows[0];
}

/**
 * Inserts or updates one price. Used by the admin form, report approval and CSV import.
 * - New price: history row (NULL -> price).
 * - Changed price: history row (old -> new).
 * - Always: last_verified_at = now() and the source is updated.
 * Returns { id, action: 'create' | 'update' | 'unchanged', oldPrice, newPrice }.
 */
export async function upsertPrice(client, { labId, testId, price, discountedPrice, reportHours, source, adminId }) {
  const existing = (
    await client.query('SELECT * FROM lab_tests WHERE lab_id = $1 AND test_id = $2 FOR UPDATE', [labId, testId])
  ).rows[0];

  if (!existing) {
    if (price == null) throw ApiError.badRequest('Price is required for a new lab price');
    if (discountedPrice != null && discountedPrice > price) {
      throw ApiError.badRequest('Discounted price cannot be higher than the price', { discountedPrice: ['Cannot be higher than the price'] });
    }
    const { rows } = await client.query(
      `INSERT INTO lab_tests (lab_id, test_id, price, discounted_price, report_hours, source, last_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [labId, testId, price, discountedPrice ?? null, reportHours ?? null, source],
    );
    await client.query(
      'INSERT INTO price_history (lab_test_id, old_price, new_price, changed_by) VALUES ($1, NULL, $2, $3)',
      [rows[0].id, price, adminId],
    );
    return { id: rows[0].id, action: 'create', oldPrice: null, newPrice: price };
  }

  const nextPrice = price ?? existing.price;
  const nextDiscount = discountedPrice !== undefined ? discountedPrice : existing.discounted_price;
  const nextHours = reportHours !== undefined ? reportHours : existing.report_hours;
  if (nextDiscount != null && nextDiscount > nextPrice) {
    throw ApiError.badRequest('Discounted price cannot be higher than the price', { discountedPrice: ['Cannot be higher than the price'] });
  }

  const priceChanged = nextPrice !== existing.price;
  const anyChange = priceChanged || nextDiscount !== existing.discounted_price || nextHours !== existing.report_hours;

  await client.query(
    `UPDATE lab_tests
     SET price = $2, discounted_price = $3, report_hours = $4, source = $5, last_verified_at = now()
     WHERE id = $1`,
    [existing.id, nextPrice, nextDiscount ?? null, nextHours ?? null, source],
  );
  if (priceChanged) {
    await client.query(
      'INSERT INTO price_history (lab_test_id, old_price, new_price, changed_by) VALUES ($1, $2, $3, $4)',
      [existing.id, existing.price, nextPrice, adminId],
    );
  }
  return {
    id: existing.id,
    action: anyChange ? 'update' : 'unchanged',
    oldPrice: existing.price,
    newPrice: nextPrice,
    before: { price: existing.price, discountedPrice: existing.discounted_price, reportHours: existing.report_hours },
  };
}

export async function createLabTest(adminId, data) {
  return audited(adminId, { action: 'create', entity: 'lab_test' }, async (client) => {
    const names = await assertLabAndTest(client, data.labId, data.testId);
    const dup = await client.query('SELECT id FROM lab_tests WHERE lab_id = $1 AND test_id = $2', [data.labId, data.testId]);
    if (dup.rowCount) throw ApiError.conflict('This lab already has a price for this test. Edit it instead.', { id: dup.rows[0].id });
    const out = await upsertPrice(client, { ...data, source: 'admin', adminId });
    return { result: { id: out.id }, entityId: out.id, details: { lab: names.lab_name, test: names.test_name, price: data.price } };
  });
}

export async function updateLabTest(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'lab_test' }, async (client) => {
    const row = ensureFound((await client.query('SELECT lab_id, test_id FROM lab_tests WHERE id = $1', [id])).rows[0], 'Price not found');
    const names = await assertLabAndTest(client, row.lab_id, row.test_id);
    const out = await upsertPrice(client, { labId: row.lab_id, testId: row.test_id, ...data, source: 'admin', adminId });
    return {
      result: { id, action: out.action },
      entityId: id,
      details: { lab: names.lab_name, test: names.test_name, before: out.before, after: data },
    };
  });
}

/** Marks a price as checked today without changing it. */
export async function verifyLabTest(adminId, id) {
  return audited(adminId, { action: 'verify', entity: 'lab_test' }, async (client) => {
    const { rows } = await client.query('UPDATE lab_tests SET last_verified_at = now() WHERE id = $1 RETURNING id, price', [id]);
    ensureFound(rows[0], 'Price not found');
    return { result: { id, lastVerifiedAt: new Date().toISOString() }, entityId: id, details: { price: rows[0].price } };
  });
}

export async function deleteLabTest(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'lab_test' }, async (client) => {
    const { rows } = await client.query(
      `SELECT lt.price, l.name AS lab_name, t.name_en AS test_name
       FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id
       WHERE lt.id = $1 FOR UPDATE OF lt`,
      [id],
    );
    const row = ensureFound(rows[0], 'Price not found');
    await client.query('DELETE FROM lab_tests WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: { lab: row.lab_name, test: row.test_name, price: row.price } };
  });
}
