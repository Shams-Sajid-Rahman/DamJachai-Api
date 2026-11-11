import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { SqlParams, escapeLike, orderBy, offsetOf, pageMeta } from '../utils/sql.js';
import { mapCategory, mapLab, mapPrice } from '../utils/mappers.js';
import { LAB_SELECT, LAB_JOINS, RATING_LATERAL, EFFECTIVE_PRICE } from './sqlFragments.js';

// Minimum pg_trgm word similarity for fuzzy matches, so "cholestrol" and "thyriod" still find results.
const FUZZY_THRESHOLD = 0.35;
// pg_trgm splits Bengali text at the vowel signs, so trigram similarity is meaningless for Bangla.
// Bangla queries (and very short ones) use substring matching only.
const BENGALI = /[ঀ-৿]/;
const canFuzzy = (q) => q.length >= 3 && !BENGALI.test(q);

// Price stats per test, counting active labs only.
const PRICE_STATS_CTE = `
  price_stats AS (
    SELECT lt.test_id,
           count(*)::int AS lab_count,
           min(${EFFECTIVE_PRICE}) AS min_price,
           max(${EFFECTIVE_PRICE}) AS max_price,
           round(avg(${EFFECTIVE_PRICE})) AS avg_price,
           max(lt.last_verified_at) AS last_verified_at
    FROM lab_tests lt
    JOIN labs l ON l.id = lt.lab_id AND l.status = 'active'
    GROUP BY lt.test_id
  )`;

function mapTestRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.name_en,
    nameBn: row.name_bn,
    description: row.description,
    sampleType: row.sample_type,
    category: mapCategory(row),
    labCount: row.lab_count ?? 0,
    minPrice: row.min_price ?? null,
    maxPrice: row.max_price ?? null,
    avgPrice: row.avg_price ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
  };
}

/** Search by English name, Bangla name, slug or alias. Fuzzy matching catches typos. */
export async function searchTests({ q, category, page, limit }) {
  const p = new SqlParams();
  const where = [`t.status = 'active'`];
  let score = '0';

  if (category) where.push(`c.slug = ${p.add(category)}`);

  if (q) {
    const raw = p.add(q);
    const contains = p.add(`%${escapeLike(q)}%`);
    const prefix = p.add(`${escapeLike(q)}%`);
    // With fuzzy matching off, the threshold is above 1, so word_similarity() never matches.
    const threshold = `${p.add(canFuzzy(q) ? FUZZY_THRESHOLD : 2)}::real`;

    where.push(`(
      t.name_en ILIKE ${contains} OR t.name_bn ILIKE ${contains} OR t.slug ILIKE ${contains}
      OR word_similarity(${raw}, t.name_en) >= ${threshold}
      OR EXISTS (
        SELECT 1 FROM test_aliases ta
        WHERE ta.test_id = t.id AND (ta.alias ILIKE ${contains} OR word_similarity(${raw}, ta.alias) >= ${threshold})
      )
    )`);

    // A higher score means a better match: exact name, then exact alias, then prefix, then substring, then fuzzy.
    score = `GREATEST(
      CASE WHEN lower(t.name_en) = lower(${raw}) OR t.name_bn = ${raw} THEN 4 ELSE 0 END,
      CASE WHEN EXISTS (SELECT 1 FROM test_aliases ta WHERE ta.test_id = t.id AND lower(ta.alias) = lower(${raw})) THEN 3 ELSE 0 END,
      CASE WHEN t.name_en ILIKE ${prefix} OR t.name_bn ILIKE ${prefix} THEN 2 ELSE 0 END,
      CASE WHEN t.name_en ILIKE ${contains} OR t.name_bn ILIKE ${contains} THEN 1.5 ELSE 0 END,
      CASE WHEN EXISTS (SELECT 1 FROM test_aliases ta WHERE ta.test_id = t.id AND ta.alias ILIKE ${contains}) THEN 1.2 ELSE 0 END,
      CASE WHEN ${threshold} <= 1 THEN word_similarity(${raw}, t.name_en) ELSE 0 END,
      CASE WHEN ${threshold} <= 1
           THEN COALESCE((SELECT max(word_similarity(${raw}, ta.alias)) FROM test_aliases ta WHERE ta.test_id = t.id), 0)
           ELSE 0 END
    )`;
  }

  const limitPh = p.add(limit);
  const offsetPh = p.add(offsetOf({ page, limit }));

  const { rows } = await query(
    `WITH ${PRICE_STATS_CTE}
     SELECT t.id, t.slug, t.name_en, t.name_bn, t.description, t.sample_type,
            c.id AS category_id, c.slug AS category_slug, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
            ps.lab_count, ps.min_price, ps.max_price, ps.avg_price, ps.last_verified_at,
            ${score} AS score,
            count(*) OVER () AS total
     FROM tests t
     JOIN test_categories c ON c.id = t.category_id
     LEFT JOIN price_stats ps ON ps.test_id = t.id
     WHERE ${where.join(' AND ')}
     ORDER BY score DESC, COALESCE(ps.lab_count, 0) DESC, t.search_count DESC, t.name_en ASC
     LIMIT ${limitPh} OFFSET ${offsetPh}`,
    p.values,
  );

  return {
    data: rows.map(mapTestRow),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

/** Most viewed tests first (search_count), then the ones offered by the most labs. */
export async function popularTests({ limit }) {
  const { rows } = await query(
    `WITH ${PRICE_STATS_CTE}
     SELECT t.id, t.slug, t.name_en, t.name_bn, t.description, t.sample_type,
            c.id AS category_id, c.slug AS category_slug, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
            ps.lab_count, ps.min_price, ps.max_price, ps.avg_price, ps.last_verified_at
     FROM tests t
     JOIN test_categories c ON c.id = t.category_id
     JOIN price_stats ps ON ps.test_id = t.id
     WHERE t.status = 'active'
     ORDER BY t.search_count DESC, ps.lab_count DESC, (ps.max_price - ps.min_price) DESC, t.name_en
     LIMIT $1`,
    [limit],
  );
  return rows.map(mapTestRow);
}

export async function findActiveTestBySlug(slug) {
  const { rows } = await query(
    `WITH ${PRICE_STATS_CTE}
     SELECT t.id, t.slug, t.name_en, t.name_bn, t.description, t.sample_type, t.preparation_note,
            c.id AS category_id, c.slug AS category_slug, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
            ps.lab_count, ps.min_price, ps.max_price, ps.avg_price, ps.last_verified_at,
            COALESCE((SELECT array_agg(ta.alias ORDER BY ta.alias) FROM test_aliases ta WHERE ta.test_id = t.id), '{}') AS aliases
     FROM tests t
     JOIN test_categories c ON c.id = t.category_id
     LEFT JOIN price_stats ps ON ps.test_id = t.id
     WHERE t.slug = $1 AND t.status = 'active'`,
    [slug],
  );
  if (!rows[0]) throw ApiError.notFound('Test not found');
  const row = rows[0];
  return { ...mapTestRow(row), preparationNote: row.preparation_note, aliases: row.aliases };
}

export function incrementSearchCount(testId) {
  return query('UPDATE tests SET search_count = search_count + 1 WHERE id = $1', [testId]);
}

const COMPARE_SORTS = {
  price_asc: `effective_price ASC, r.avg_rating DESC NULLS LAST, l.name ASC`,
  price_desc: `effective_price DESC, l.name ASC`,
  rating: `r.avg_rating DESC NULLS LAST, r.review_count DESC, effective_price ASC`,
  report_time: `lt.report_hours ASC NULLS LAST, effective_price ASC`,
};

/** Every active lab that offers a test, with filters, sorting and price statistics. */
export async function compareTest(slug, filters) {
  const test = await findActiveTestBySlug(slug);
  const p = new SqlParams();
  const where = [`lt.test_id = ${p.add(test.id)}`, `l.status = 'active'`];

  if (filters.city) where.push(`c.slug = ${p.add(filters.city)}`);
  if (filters.area) where.push(`a.slug = ${p.add(filters.area)}`);
  if (filters.homeCollection !== undefined) where.push(`l.home_collection = ${p.add(filters.homeCollection)}`);
  if (filters.accredited !== undefined) where.push(`l.is_accredited = ${p.add(filters.accredited)}`);
  if (filters.minRating) where.push(`COALESCE(r.avg_rating, 0) >= ${p.add(filters.minRating)}`);

  const { rows } = await query(
    `SELECT ${LAB_SELECT},
            lt.id AS lab_test_id, lt.price, lt.discounted_price, ${EFFECTIVE_PRICE} AS effective_price,
            lt.report_hours, lt.last_verified_at, lt.source,
            r.avg_rating, r.review_count
     FROM lab_tests lt
     JOIN labs l ON l.id = lt.lab_id
     ${LAB_JOINS}
     ${RATING_LATERAL}
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy(COMPARE_SORTS, filters.sort)}`,
    p.values,
  );

  // Count the visit without making the response wait for it.
  incrementSearchCount(test.id).catch(() => {});

  const prices = rows.map((r) => r.effective_price);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
  const cheapest = rows.find((r) => r.effective_price === min);

  return {
    test,
    filters,
    stats: {
      count: rows.length,
      minPrice: min,
      maxPrice: max,
      avgPrice: avg,
      saving: min == null ? 0 : max - min,
      cheapestLabId: cheapest?.lab_id ?? null,
    },
    results: rows.map((row) => ({
      ...mapPrice(row),
      isCheapest: row.effective_price === min,
      savingVsMax: max - row.effective_price,
      lab: mapLab(row),
    })),
  };
}

export async function priceHistory(slug, { labId }) {
  const test = await findActiveTestBySlug(slug);
  const p = new SqlParams();
  const where = [`lt.test_id = ${p.add(test.id)}`, `l.status = 'active'`];
  if (labId) where.push(`lt.lab_id = ${p.add(labId)}`);

  const { rows } = await query(
    `SELECT ph.id, ph.old_price, ph.new_price, ph.changed_at,
            l.id AS lab_id, l.name AS lab_name, l.slug AS lab_slug
     FROM price_history ph
     JOIN lab_tests lt ON lt.id = ph.lab_test_id
     JOIN labs l ON l.id = lt.lab_id
     WHERE ${where.join(' AND ')}
     ORDER BY ph.changed_at ASC
     LIMIT 1000`,
    p.values,
  );

  return {
    test: { id: test.id, slug: test.slug, nameEn: test.nameEn, nameBn: test.nameBn },
    points: rows.map((r) => ({
      id: r.id,
      oldPrice: r.old_price,
      newPrice: r.new_price,
      changedAt: r.changed_at,
      lab: { id: r.lab_id, name: r.lab_name, slug: r.lab_slug },
    })),
  };
}
