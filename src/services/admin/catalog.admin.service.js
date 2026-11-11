// Admin CRUD for cities, areas and test categories.
import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, orderBy, pageMeta } from '../../utils/sql.js';
import { slugify } from '../../utils/slugify.js';
import { audited, buildSet, diff, DIRECTION, ensureFound, uniqueConflict } from './helpers.js';

const NAME_COLUMNS = { nameEn: 'name_en', nameBn: 'name_bn', slug: 'slug' };
const AREA_COLUMNS = { cityId: 'city_id', ...NAME_COLUMNS };

const mapNamed = (r) => ({ id: r.id, slug: r.slug, nameEn: r.name_en, nameBn: r.name_bn });

// ---------- Cities ----------

export async function listCities({ q, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(name_en ILIKE ${c} OR name_bn ILIKE ${c} OR slug ILIKE ${c})`);
  }
  const sortCol = orderBy({ name: 'name_en', created: 'id', count: 'lab_count' }, sort);
  const { rows } = await query(
    `SELECT ci.*,
            (SELECT count(*)::int FROM areas a WHERE a.city_id = ci.id) AS area_count,
            (SELECT count(*)::int FROM labs l WHERE l.city_id = ci.id) AS lab_count,
            count(*) OVER () AS total
     FROM cities ci WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({ ...mapNamed(r), areaCount: r.area_count, labCount: r.lab_count })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

export async function createCity(adminId, data) {
  const values = { ...data, slug: data.slug || slugify(data.nameEn, 'city') };
  return audited(adminId, { action: 'create', entity: 'city' }, async (client) => {
    try {
      const { rows } = await client.query(
        'INSERT INTO cities (name_en, name_bn, slug) VALUES ($1, $2, $3) RETURNING *',
        [values.nameEn, values.nameBn, values.slug],
      );
      return { result: mapNamed(rows[0]), entityId: rows[0].id, details: values };
    } catch (err) {
      return uniqueConflict(err, 'A city with this name or slug already exists');
    }
  });
}

export async function updateCity(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'city' }, async (client) => {
    const before = ensureFound((await client.query('SELECT * FROM cities WHERE id = $1 FOR UPDATE', [id])).rows[0], 'City not found');
    const p = new SqlParams();
    const sets = buildSet(NAME_COLUMNS, data, p);
    try {
      const { rows } = await client.query(`UPDATE cities SET ${sets.join(', ')} WHERE id = ${p.add(id)} RETURNING *`, p.values);
      return { result: mapNamed(rows[0]), entityId: id, details: diff(before, data, NAME_COLUMNS) };
    } catch (err) {
      return uniqueConflict(err, 'A city with this name or slug already exists');
    }
  });
}

export async function deleteCity(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'city' }, async (client) => {
    const city = ensureFound((await client.query('SELECT * FROM cities WHERE id = $1 FOR UPDATE', [id])).rows[0], 'City not found');
    const { rows } = await client.query(
      `SELECT (SELECT count(*)::int FROM areas WHERE city_id = $1) AS areas,
              (SELECT count(*)::int FROM labs WHERE city_id = $1) AS labs`,
      [id],
    );
    if (rows[0].areas || rows[0].labs) {
      throw ApiError.conflict('This city still has areas or labs. Move or delete them first.', rows[0]);
    }
    await client.query('DELETE FROM cities WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: mapNamed(city) };
  });
}

// ---------- Areas ----------

export async function listAreas({ q, cityId, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (cityId) where.push(`a.city_id = ${p.add(cityId)}`);
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(a.name_en ILIKE ${c} OR a.name_bn ILIKE ${c} OR a.slug ILIKE ${c})`);
  }
  const sortCol = orderBy({ name: 'a.name_en', created: 'a.id', count: 'lab_count' }, sort);
  const { rows } = await query(
    `SELECT a.*, ci.name_en AS city_name_en, ci.name_bn AS city_name_bn, ci.slug AS city_slug,
            (SELECT count(*)::int FROM labs l WHERE l.area_id = a.id) AS lab_count,
            count(*) OVER () AS total
     FROM areas a JOIN cities ci ON ci.id = a.city_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, a.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({
      ...mapNamed(r),
      cityId: r.city_id,
      city: { id: r.city_id, slug: r.city_slug, nameEn: r.city_name_en, nameBn: r.city_name_bn },
      labCount: r.lab_count,
    })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

async function assertCity(client, cityId) {
  const { rowCount } = await client.query('SELECT 1 FROM cities WHERE id = $1', [cityId]);
  if (!rowCount) throw ApiError.badRequest('City does not exist', { cityId: ['City does not exist'] });
}

export async function createArea(adminId, data) {
  const values = { ...data, slug: data.slug || slugify(data.nameEn, 'area') };
  return audited(adminId, { action: 'create', entity: 'area' }, async (client) => {
    await assertCity(client, values.cityId);
    try {
      const { rows } = await client.query(
        'INSERT INTO areas (city_id, name_en, name_bn, slug) VALUES ($1, $2, $3, $4) RETURNING *',
        [values.cityId, values.nameEn, values.nameBn, values.slug],
      );
      return { result: { ...mapNamed(rows[0]), cityId: rows[0].city_id }, entityId: rows[0].id, details: values };
    } catch (err) {
      return uniqueConflict(err, 'This city already has an area with this name or slug');
    }
  });
}

export async function updateArea(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'area' }, async (client) => {
    const before = ensureFound((await client.query('SELECT * FROM areas WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Area not found');
    if (data.cityId) {
      await assertCity(client, data.cityId);
      const { rowCount } = await client.query('SELECT 1 FROM labs WHERE area_id = $1 AND city_id <> $2', [id, data.cityId]);
      if (rowCount) throw ApiError.conflict('Labs in this area belong to its current city. Move the labs first.');
    }
    const p = new SqlParams();
    const sets = buildSet(AREA_COLUMNS, data, p);
    try {
      const { rows } = await client.query(`UPDATE areas SET ${sets.join(', ')} WHERE id = ${p.add(id)} RETURNING *`, p.values);
      return { result: { ...mapNamed(rows[0]), cityId: rows[0].city_id }, entityId: id, details: diff(before, data, AREA_COLUMNS) };
    } catch (err) {
      return uniqueConflict(err, 'This city already has an area with this name or slug');
    }
  });
}

export async function deleteArea(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'area' }, async (client) => {
    const area = ensureFound((await client.query('SELECT * FROM areas WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Area not found');
    const { rows } = await client.query('SELECT count(*)::int AS labs FROM labs WHERE area_id = $1', [id]);
    if (rows[0].labs) throw ApiError.conflict('Labs are still in this area. Move them first.', rows[0]);
    await client.query('DELETE FROM areas WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: mapNamed(area) };
  });
}

// ---------- Test categories ----------

export async function listCategories({ q, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(name_en ILIKE ${c} OR name_bn ILIKE ${c} OR slug ILIKE ${c})`);
  }
  const sortCol = orderBy({ name: 'name_en', created: 'id', count: 'test_count' }, sort);
  const { rows } = await query(
    `SELECT tc.*, (SELECT count(*)::int FROM tests t WHERE t.category_id = tc.id) AS test_count,
            count(*) OVER () AS total
     FROM test_categories tc WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({ ...mapNamed(r), testCount: r.test_count })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

export async function createCategory(adminId, data) {
  const values = { ...data, slug: data.slug || slugify(data.nameEn, 'category') };
  return audited(adminId, { action: 'create', entity: 'category' }, async (client) => {
    try {
      const { rows } = await client.query(
        'INSERT INTO test_categories (name_en, name_bn, slug) VALUES ($1, $2, $3) RETURNING *',
        [values.nameEn, values.nameBn, values.slug],
      );
      return { result: mapNamed(rows[0]), entityId: rows[0].id, details: values };
    } catch (err) {
      return uniqueConflict(err, 'A category with this name or slug already exists');
    }
  });
}

export async function updateCategory(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'category' }, async (client) => {
    const before = ensureFound(
      (await client.query('SELECT * FROM test_categories WHERE id = $1 FOR UPDATE', [id])).rows[0],
      'Category not found',
    );
    const p = new SqlParams();
    const sets = buildSet(NAME_COLUMNS, data, p);
    try {
      const { rows } = await client.query(
        `UPDATE test_categories SET ${sets.join(', ')} WHERE id = ${p.add(id)} RETURNING *`,
        p.values,
      );
      return { result: mapNamed(rows[0]), entityId: id, details: diff(before, data, NAME_COLUMNS) };
    } catch (err) {
      return uniqueConflict(err, 'A category with this name or slug already exists');
    }
  });
}

export async function deleteCategory(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'category' }, async (client) => {
    const cat = ensureFound(
      (await client.query('SELECT * FROM test_categories WHERE id = $1 FOR UPDATE', [id])).rows[0],
      'Category not found',
    );
    const { rows } = await client.query('SELECT count(*)::int AS tests FROM tests WHERE category_id = $1', [id]);
    if (rows[0].tests) throw ApiError.conflict('This category still has tests. Move them to another category first.', rows[0]);
    await client.query('DELETE FROM test_categories WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: mapNamed(cat) };
  });
}
