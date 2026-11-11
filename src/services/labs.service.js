import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { SqlParams, escapeLike, orderBy, offsetOf, pageMeta } from '../utils/sql.js';
import { mapCategory, mapLab } from '../utils/mappers.js';
import { LAB_SELECT, LAB_JOINS, RATING_LATERAL } from './sqlFragments.js';

const LAB_SORTS = {
  name: 'l.name ASC',
  rating: 'r.avg_rating DESC NULLS LAST, r.review_count DESC, l.name ASC',
  tests: 'test_count DESC, l.name ASC',
  newest: 'l.created_at DESC',
};

export async function listLabs({ q, city, area, homeCollection, accredited, minRating, sort, page, limit }) {
  const p = new SqlParams();
  const where = [`l.status = 'active'`];

  if (q) {
    const contains = p.add(`%${escapeLike(q)}%`);
    where.push(`(l.name ILIKE ${contains} OR l.address ILIKE ${contains})`);
  }
  if (city) where.push(`c.slug = ${p.add(city)}`);
  if (area) where.push(`a.slug = ${p.add(area)}`);
  if (homeCollection !== undefined) where.push(`l.home_collection = ${p.add(homeCollection)}`);
  if (accredited !== undefined) where.push(`l.is_accredited = ${p.add(accredited)}`);
  if (minRating) where.push(`COALESCE(r.avg_rating, 0) >= ${p.add(minRating)}`);

  const { rows } = await query(
    `SELECT ${LAB_SELECT}, r.avg_rating, r.review_count,
            (SELECT count(*)::int FROM lab_tests lt WHERE lt.lab_id = l.id) AS test_count,
            count(*) OVER () AS total
     FROM labs l
     ${LAB_JOINS}
     ${RATING_LATERAL}
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy(LAB_SORTS, sort)}
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );

  return {
    data: rows.map((row) => ({ ...mapLab(row), testCount: row.test_count })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

export async function getLabBySlug(slug, { userId } = {}) {
  const { rows } = await query(
    `SELECT ${LAB_SELECT}, r.avg_rating, r.review_count,
            (SELECT round(100.0 * count(*) FILTER (WHERE rv.report_on_time) / NULLIF(count(rv.report_on_time), 0))
             FROM reviews rv WHERE rv.lab_id = l.id AND rv.status = 'approved') AS on_time_percent
     FROM labs l
     ${LAB_JOINS}
     ${RATING_LATERAL}
     WHERE l.slug = $1 AND l.status = 'active'`,
    [slug],
  );
  if (!rows[0]) throw ApiError.notFound('Lab not found');
  const lab = { ...mapLab(rows[0]), onTimePercent: rows[0].on_time_percent };

  const [tests, reviews, favorite] = await Promise.all([
    query(
      `SELECT t.id, t.slug, t.name_en, t.name_bn,
              c.id AS category_id, c.slug AS category_slug, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
              lt.id AS lab_test_id, lt.price, lt.discounted_price,
              COALESCE(lt.discounted_price, lt.price) AS effective_price,
              lt.report_hours, lt.last_verified_at
       FROM lab_tests lt
       JOIN tests t ON t.id = lt.test_id AND t.status = 'active'
       JOIN test_categories c ON c.id = t.category_id
       WHERE lt.lab_id = $1
       ORDER BY c.name_en, t.name_en`,
      [lab.id],
    ),
    query(
      `SELECT rv.id, rv.rating, rv.report_on_time, rv.comment, rv.created_at, u.name AS user_name
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       WHERE rv.lab_id = $1 AND rv.status = 'approved'
       ORDER BY rv.created_at DESC
       LIMIT 50`,
      [lab.id],
    ),
    userId
      ? query('SELECT 1 FROM favorites WHERE user_id = $1 AND lab_id = $2', [userId, lab.id])
      : Promise.resolve({ rowCount: 0 }),
  ]);

  return {
    ...lab,
    isFavorite: favorite.rowCount > 0,
    tests: tests.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      nameEn: row.name_en,
      nameBn: row.name_bn,
      category: mapCategory(row),
      labTestId: row.lab_test_id,
      price: row.price,
      discountedPrice: row.discounted_price,
      effectivePrice: row.effective_price,
      reportHours: row.report_hours,
      lastVerifiedAt: row.last_verified_at,
    })),
    reviews: reviews.rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      reportOnTime: row.report_on_time,
      comment: row.comment,
      createdAt: row.created_at,
      // Show the first name only, to protect privacy.
      userName: row.user_name.split(' ')[0],
    })),
  };
}

export async function findActiveLab(labId) {
  const { rows } = await query(`SELECT id, name, slug FROM labs WHERE id = $1 AND status = 'active'`, [labId]);
  if (!rows[0]) throw ApiError.notFound('Lab not found');
  return rows[0];
}
