import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, orderBy, pageMeta } from '../../utils/sql.js';
import { slugify } from '../../utils/slugify.js';
import { audited, buildSet, diff, DIRECTION, ensureFound, uniqueConflict } from './helpers.js';

const TEST_COLUMNS = {
  categoryId: 'category_id',
  nameEn: 'name_en',
  nameBn: 'name_bn',
  slug: 'slug',
  description: 'description',
  sampleType: 'sample_type',
  preparationNote: 'preparation_note',
  status: 'status',
};

function mapAdminTest(r) {
  return {
    id: r.id,
    categoryId: r.category_id,
    category: { id: r.category_id, nameEn: r.category_name_en, nameBn: r.category_name_bn },
    nameEn: r.name_en,
    nameBn: r.name_bn,
    slug: r.slug,
    description: r.description,
    sampleType: r.sample_type,
    preparationNote: r.preparation_note,
    status: r.status,
    searchCount: r.search_count,
    aliases: r.aliases || [],
    priceCount: r.price_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const TEST_SELECT = `
  t.*, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
  COALESCE((SELECT array_agg(ta.alias ORDER BY ta.alias) FROM test_aliases ta WHERE ta.test_id = t.id), '{}') AS aliases,
  (SELECT count(*)::int FROM lab_tests lt WHERE lt.test_id = t.id) AS price_count`;

export async function listTests({ q, categoryId, status, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(t.name_en ILIKE ${c} OR t.name_bn ILIKE ${c} OR t.slug ILIKE ${c}
      OR EXISTS (SELECT 1 FROM test_aliases ta WHERE ta.test_id = t.id AND ta.alias ILIKE ${c}))`);
  }
  if (categoryId) where.push(`t.category_id = ${p.add(categoryId)}`);
  if (status) where.push(`t.status = ${p.add(status)}`);

  const sortCol = orderBy({ name: 't.name_en', created: 't.created_at', prices: 'price_count', searches: 't.search_count' }, sort);
  const { rows } = await query(
    `SELECT ${TEST_SELECT}, count(*) OVER () AS total
     FROM tests t JOIN test_categories c ON c.id = t.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, t.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return { data: rows.map(mapAdminTest), meta: pageMeta({ page, limit }, rows[0]?.total ?? 0) };
}

export async function getTest(id) {
  const { rows } = await query(
    `SELECT ${TEST_SELECT} FROM tests t JOIN test_categories c ON c.id = t.category_id WHERE t.id = $1`,
    [id],
  );
  return mapAdminTest(ensureFound(rows[0], 'Test not found'));
}

/** Aliases are de-duplicated without regard to case. */
function cleanAliases(aliases = []) {
  const seen = new Map();
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()];
}

async function replaceAliases(client, testId, aliases) {
  await client.query('DELETE FROM test_aliases WHERE test_id = $1', [testId]);
  for (const alias of cleanAliases(aliases)) {
    await client.query('INSERT INTO test_aliases (test_id, alias) VALUES ($1, $2)', [testId, alias]);
  }
}

async function assertCategory(client, categoryId) {
  const { rowCount } = await client.query('SELECT 1 FROM test_categories WHERE id = $1', [categoryId]);
  if (!rowCount) throw ApiError.badRequest('Category does not exist', { categoryId: ['Category does not exist'] });
}

export async function createTest(adminId, data) {
  const values = { status: 'active', ...data, slug: data.slug || slugify(data.nameEn, 'test') };
  return audited(adminId, { action: 'create', entity: 'test' }, async (client) => {
    await assertCategory(client, values.categoryId);
    const p = new SqlParams();
    const cols = [];
    const phs = [];
    for (const [key, column] of Object.entries(TEST_COLUMNS)) {
      if (values[key] !== undefined) {
        cols.push(column);
        phs.push(p.add(values[key]));
      }
    }
    let id;
    try {
      ({ rows: [{ id }] } = await client.query(`INSERT INTO tests (${cols.join(', ')}) VALUES (${phs.join(', ')}) RETURNING id`, p.values));
    } catch (err) {
      return uniqueConflict(err, 'A test with this slug already exists');
    }
    await replaceAliases(client, id, values.aliases);
    return { result: { id, slug: values.slug }, entityId: id, details: { nameEn: values.nameEn, slug: values.slug, aliases: cleanAliases(values.aliases) } };
  });
}

export async function updateTest(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'test' }, async (client) => {
    const before = ensureFound((await client.query('SELECT * FROM tests WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Test not found');
    if (data.categoryId) await assertCategory(client, data.categoryId);

    const p = new SqlParams();
    const sets = buildSet(TEST_COLUMNS, data, p);
    if (sets.length) {
      try {
        await client.query(`UPDATE tests SET ${sets.join(', ')} WHERE id = ${p.add(id)}`, p.values);
      } catch (err) {
        return uniqueConflict(err, 'A test with this slug already exists');
      }
    }

    const changes = diff(before, data, TEST_COLUMNS);
    if (data.aliases) {
      const { rows } = await client.query('SELECT alias FROM test_aliases WHERE test_id = $1 ORDER BY alias', [id]);
      await replaceAliases(client, id, data.aliases);
      changes.aliases = { from: rows.map((r) => r.alias), to: cleanAliases(data.aliases) };
    }
    const action = changes.status ? (data.status === 'hidden' ? 'hide' : 'unhide') : 'update';
    return { result: { id }, entityId: id, action, details: { nameEn: before.name_en, changes } };
  });
}

/** A test with prices or price reports is hidden. Only a test with nothing linked to it is deleted. */
export async function deleteTest(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'test' }, async (client) => {
    const test = ensureFound((await client.query('SELECT * FROM tests WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Test not found');
    const { rows } = await client.query(
      `SELECT (SELECT count(*)::int FROM lab_tests WHERE test_id = $1) AS prices,
              (SELECT count(*)::int FROM price_reports WHERE test_id = $1) AS price_reports`,
      [id],
    );
    const deps = rows[0];
    if (deps.prices || deps.price_reports) {
      await client.query(`UPDATE tests SET status = 'hidden' WHERE id = $1`, [id]);
      return { result: { id, result: 'hidden', dependents: deps }, entityId: id, action: 'hide', details: { nameEn: test.name_en, dependents: deps } };
    }
    await client.query('DELETE FROM tests WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: { nameEn: test.name_en, slug: test.slug } };
  });
}
