import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, orderBy, pageMeta } from '../../utils/sql.js';
import { slugify } from '../../utils/slugify.js';
import { audited, buildSet, diff, DIRECTION, ensureFound, uniqueConflict } from './helpers.js';

const LAB_COLUMNS = {
  name: 'name',
  slug: 'slug',
  cityId: 'city_id',
  areaId: 'area_id',
  address: 'address',
  phone: 'phone',
  website: 'website',
  latitude: 'latitude',
  longitude: 'longitude',
  openingHours: 'opening_hours',
  isAccredited: 'is_accredited',
  accreditationNote: 'accreditation_note',
  homeCollection: 'home_collection',
  homeCollectionFee: 'home_collection_fee',
  isSample: 'is_sample',
  status: 'status',
};

export function mapAdminLab(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    cityId: r.city_id,
    areaId: r.area_id,
    city: r.city_name_en ? { id: r.city_id, nameEn: r.city_name_en, nameBn: r.city_name_bn } : undefined,
    area: r.area_name_en ? { id: r.area_id, nameEn: r.area_name_en, nameBn: r.area_name_bn } : null,
    address: r.address,
    phone: r.phone,
    website: r.website,
    latitude: r.latitude,
    longitude: r.longitude,
    openingHours: r.opening_hours,
    isAccredited: r.is_accredited,
    accreditationNote: r.accreditation_note,
    homeCollection: r.home_collection,
    homeCollectionFee: r.home_collection_fee,
    isSample: r.is_sample,
    status: r.status,
    priceCount: r.price_count,
    reviewCount: r.review_count,
    oldestVerifiedAt: r.oldest_verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const LAB_LIST_SELECT = `
  l.*, c.name_en AS city_name_en, c.name_bn AS city_name_bn, a.name_en AS area_name_en, a.name_bn AS area_name_bn,
  (SELECT count(*)::int FROM lab_tests lt WHERE lt.lab_id = l.id) AS price_count,
  (SELECT count(*)::int FROM reviews rv WHERE rv.lab_id = l.id) AS review_count,
  (SELECT min(lt.last_verified_at) FROM lab_tests lt WHERE lt.lab_id = l.id) AS oldest_verified_at`;

export async function listLabs({ q, cityId, areaId, status, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(l.name ILIKE ${c} OR l.slug ILIKE ${c} OR l.address ILIKE ${c} OR l.phone ILIKE ${c})`);
  }
  if (cityId) where.push(`l.city_id = ${p.add(cityId)}`);
  if (areaId) where.push(`l.area_id = ${p.add(areaId)}`);
  if (status) where.push(`l.status = ${p.add(status)}`);

  const sortCol = orderBy(
    { name: 'l.name', created: 'l.created_at', updated: 'l.updated_at', prices: 'price_count', oldest_verified: 'oldest_verified_at' },
    sort,
  );
  const { rows } = await query(
    `SELECT ${LAB_LIST_SELECT}, count(*) OVER () AS total
     FROM labs l JOIN cities c ON c.id = l.city_id LEFT JOIN areas a ON a.id = l.area_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]} NULLS LAST, l.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return { data: rows.map(mapAdminLab), meta: pageMeta({ page, limit }, rows[0]?.total ?? 0) };
}

export async function getLab(id) {
  const { rows } = await query(
    `SELECT ${LAB_LIST_SELECT}
     FROM labs l JOIN cities c ON c.id = l.city_id LEFT JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1`,
    [id],
  );
  return mapAdminLab(ensureFound(rows[0], 'Lab not found'));
}

/** The area must belong to the lab's city. */
async function assertLocation(client, cityId, areaId) {
  const { rowCount } = await client.query('SELECT 1 FROM cities WHERE id = $1', [cityId]);
  if (!rowCount) throw ApiError.badRequest('City does not exist', { cityId: ['City does not exist'] });
  if (areaId) {
    const area = await client.query('SELECT city_id FROM areas WHERE id = $1', [areaId]);
    if (!area.rowCount) throw ApiError.badRequest('Area does not exist', { areaId: ['Area does not exist'] });
    if (area.rows[0].city_id !== cityId) {
      throw ApiError.badRequest('The area is not in the selected city', { areaId: ['The area is not in the selected city'] });
    }
  }
}

export async function createLab(adminId, data) {
  const values = {
    isAccredited: false,
    homeCollection: false,
    isSample: false,
    status: 'active',
    ...data,
    slug: data.slug || slugify(data.name, 'lab'),
  };
  if (!values.homeCollection) values.homeCollectionFee = null;

  return audited(adminId, { action: 'create', entity: 'lab' }, async (client) => {
    await assertLocation(client, values.cityId, values.areaId);
    const p = new SqlParams();
    const cols = [];
    const phs = [];
    for (const [key, column] of Object.entries(LAB_COLUMNS)) {
      if (values[key] !== undefined) {
        cols.push(column);
        phs.push(p.add(values[key]));
      }
    }
    try {
      const { rows } = await client.query(
        `INSERT INTO labs (${cols.join(', ')}) VALUES (${phs.join(', ')}) RETURNING id`,
        p.values,
      );
      return { result: { id: rows[0].id, slug: values.slug }, entityId: rows[0].id, details: { name: values.name, slug: values.slug } };
    } catch (err) {
      return uniqueConflict(err, 'A lab with this slug already exists');
    }
  });
}

export async function updateLab(adminId, id, data) {
  return audited(adminId, { action: 'update', entity: 'lab' }, async (client) => {
    const before = ensureFound((await client.query('SELECT * FROM labs WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Lab not found');
    const cityId = data.cityId ?? before.city_id;
    // Changing the city without choosing a new area clears the old area.
    const areaId = data.areaId !== undefined ? data.areaId : data.cityId && data.cityId !== before.city_id ? null : before.area_id;
    await assertLocation(client, cityId, areaId);

    const values = { ...data, areaId };
    if (values.homeCollection === false) values.homeCollectionFee = null;

    const p = new SqlParams();
    const sets = buildSet(LAB_COLUMNS, values, p);
    try {
      await client.query(`UPDATE labs SET ${sets.join(', ')} WHERE id = ${p.add(id)}`, p.values);
    } catch (err) {
      return uniqueConflict(err, 'A lab with this slug already exists');
    }
    const changes = diff(before, values, LAB_COLUMNS);
    const action = changes.status ? (values.status === 'hidden' ? 'hide' : 'unhide') : 'update';
    return { result: { id }, entityId: id, action, details: { name: before.name, changes } };
  });
}

/**
 * A lab with prices, reviews, reports or favorites is hidden (status = 'hidden') so history is kept.
 * Only a lab with nothing linked to it is deleted for real.
 */
export async function deleteLab(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'lab' }, async (client) => {
    const lab = ensureFound((await client.query('SELECT * FROM labs WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Lab not found');
    const { rows } = await client.query(
      `SELECT (SELECT count(*)::int FROM lab_tests WHERE lab_id = $1) AS prices,
              (SELECT count(*)::int FROM reviews WHERE lab_id = $1) AS reviews,
              (SELECT count(*)::int FROM price_reports WHERE lab_id = $1) AS price_reports,
              (SELECT count(*)::int FROM favorites WHERE lab_id = $1) AS favorites`,
      [id],
    );
    const deps = rows[0];
    const hasDependents = Object.values(deps).some((n) => n > 0);

    if (hasDependents) {
      await client.query(`UPDATE labs SET status = 'hidden' WHERE id = $1`, [id]);
      return { result: { id, result: 'hidden', dependents: deps }, entityId: id, action: 'hide', details: { name: lab.name, dependents: deps } };
    }
    await client.query('DELETE FROM labs WHERE id = $1', [id]);
    return { result: { id, result: 'deleted' }, entityId: id, details: { name: lab.name, slug: lab.slug } };
  });
}
