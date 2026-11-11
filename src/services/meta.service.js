import { query } from '../config/db.js';

export async function listCities() {
  const { rows } = await query(
    `SELECT c.id, c.slug, c.name_en, c.name_bn,
            (SELECT count(*)::int FROM labs l WHERE l.city_id = c.id AND l.status = 'active') AS lab_count,
            COALESCE(
              (SELECT json_agg(json_build_object('id', a.id, 'slug', a.slug, 'nameEn', a.name_en, 'nameBn', a.name_bn)
                               ORDER BY a.name_en)
               FROM areas a WHERE a.city_id = c.id),
              '[]'
            ) AS areas
     FROM cities c
     ORDER BY c.name_en`,
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, nameEn: r.name_en, nameBn: r.name_bn, labCount: r.lab_count, areas: r.areas }));
}

export async function listAreas({ city }) {
  const { rows } = await query(
    `SELECT a.id, a.slug, a.name_en, a.name_bn, c.slug AS city_slug,
            (SELECT count(*)::int FROM labs l WHERE l.area_id = a.id AND l.status = 'active') AS lab_count
     FROM areas a
     JOIN cities c ON c.id = a.city_id
     WHERE ($1::text IS NULL OR c.slug = $1)
     ORDER BY c.name_en, a.name_en`,
    [city ?? null],
  );
  return rows.map((r) => ({
    id: r.id, slug: r.slug, nameEn: r.name_en, nameBn: r.name_bn, citySlug: r.city_slug, labCount: r.lab_count,
  }));
}

export async function listCategories() {
  const { rows } = await query(
    `SELECT c.id, c.slug, c.name_en, c.name_bn,
            (SELECT count(*)::int FROM tests t WHERE t.category_id = c.id AND t.status = 'active') AS test_count
     FROM test_categories c
     ORDER BY c.name_en`,
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, nameEn: r.name_en, nameBn: r.name_bn, testCount: r.test_count }));
}

/** Numbers for the landing page. A price counts as "verified" if it was checked in the last 90 days. */
export async function getStats() {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM labs WHERE status = 'active') AS labs,
       (SELECT count(*)::int FROM tests WHERE status = 'active') AS tests,
       (SELECT count(*)::int FROM cities) AS cities,
       (SELECT count(*)::int FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id AND l.status = 'active') AS prices,
       (SELECT count(*)::int FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id AND l.status = 'active'
          WHERE lt.last_verified_at > now() - interval '90 days') AS verified_prices,
       (SELECT max(last_verified_at) FROM lab_tests) AS last_verified_at,
       (SELECT count(*)::int FROM reviews WHERE status = 'approved') AS reviews`,
  );
  const s = rows[0];
  return {
    labs: s.labs,
    tests: s.tests,
    cities: s.cities,
    prices: s.prices,
    verifiedPrices: s.verified_prices,
    reviews: s.reviews,
    lastVerifiedAt: s.last_verified_at,
  };
}
