import { query } from '../../config/db.js';
import { SqlParams, offsetOf, pageMeta } from '../../utils/sql.js';

const STALE_DAYS = 90;

export async function getDashboard() {
  const [totals, recent, oldest, byCategory, activity] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*)::int FROM labs WHERE status = 'active') AS active_labs,
         (SELECT count(*)::int FROM labs WHERE status = 'hidden') AS hidden_labs,
         (SELECT count(*)::int FROM tests WHERE status = 'active') AS active_tests,
         (SELECT count(*)::int FROM tests WHERE status = 'hidden') AS hidden_tests,
         (SELECT count(*)::int FROM lab_tests) AS prices,
         (SELECT count(*)::int FROM lab_tests WHERE last_verified_at < now() - make_interval(days => $1)) AS stale_prices,
         (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new_users_week,
         (SELECT count(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
         (SELECT count(*)::int FROM price_reports WHERE status = 'pending') AS pending_reports,
         (SELECT count(*)::int FROM cities) AS cities,
         (SELECT count(*)::int FROM test_categories) AS categories`,
      [STALE_DAYS],
    ),
    query(
      `SELECT lt.id, lt.price, lt.discounted_price, lt.updated_at, lt.last_verified_at, lt.source,
              l.name AS lab_name, l.slug AS lab_slug, t.name_en AS test_name_en, t.name_bn AS test_name_bn, t.slug AS test_slug
       FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id
       ORDER BY lt.updated_at DESC LIMIT 10`,
    ),
    query(
      `SELECT l.id, l.name, l.slug, min(lt.last_verified_at) AS oldest_verified_at,
              count(*)::int AS price_count,
              count(*) FILTER (WHERE lt.last_verified_at < now() - make_interval(days => $1))::int AS stale_count
       FROM labs l JOIN lab_tests lt ON lt.lab_id = l.id
       WHERE l.status = 'active'
       GROUP BY l.id
       ORDER BY oldest_verified_at ASC
       LIMIT 8`,
      [STALE_DAYS],
    ),
    query(
      `SELECT c.name_en, c.name_bn, c.slug, count(lt.id)::int AS prices, round(avg(lt.price))::int AS avg_price
       FROM test_categories c
       LEFT JOIN tests t ON t.category_id = c.id
       LEFT JOIN lab_tests lt ON lt.test_id = t.id
       GROUP BY c.id ORDER BY prices DESC`,
    ),
    query(
      `SELECT d::date AS day,
              (SELECT count(*)::int FROM price_reports pr WHERE pr.created_at::date = d::date) AS reports,
              (SELECT count(*)::int FROM reviews rv WHERE rv.created_at::date = d::date) AS reviews,
              (SELECT count(*)::int FROM audit_logs al WHERE al.created_at::date = d::date) AS admin_actions
       FROM generate_series(current_date - 13, current_date, interval '1 day') AS d
       ORDER BY day`,
    ),
  ]);

  const t = totals.rows[0];
  return {
    totals: {
      activeLabs: t.active_labs,
      hiddenLabs: t.hidden_labs,
      activeTests: t.active_tests,
      hiddenTests: t.hidden_tests,
      prices: t.prices,
      stalePrices: t.stale_prices,
      users: t.users,
      newUsersWeek: t.new_users_week,
      pendingReviews: t.pending_reviews,
      pendingReports: t.pending_reports,
      cities: t.cities,
      categories: t.categories,
    },
    staleDays: STALE_DAYS,
    recentPrices: recent.rows.map((r) => ({
      id: r.id,
      price: r.price,
      discountedPrice: r.discounted_price,
      updatedAt: r.updated_at,
      lastVerifiedAt: r.last_verified_at,
      source: r.source,
      lab: { name: r.lab_name, slug: r.lab_slug },
      test: { nameEn: r.test_name_en, nameBn: r.test_name_bn, slug: r.test_slug },
    })),
    oldestVerifiedLabs: oldest.rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, oldestVerifiedAt: r.oldest_verified_at, priceCount: r.price_count, staleCount: r.stale_count,
    })),
    pricesByCategory: byCategory.rows.map((r) => ({ nameEn: r.name_en, nameBn: r.name_bn, slug: r.slug, prices: r.prices, avgPrice: r.avg_price })),
    activity: activity.rows.map((r) => ({ day: r.day, reports: r.reports, reviews: r.reviews, adminActions: r.admin_actions })),
  };
}

export async function listAuditLogs({ entity, action, adminId, entityId, from, to, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (entity) where.push(`al.entity = ${p.add(entity)}`);
  if (action) where.push(`al.action = ${p.add(action)}`);
  if (adminId) where.push(`al.admin_id = ${p.add(adminId)}`);
  if (entityId) where.push(`al.entity_id = ${p.add(entityId)}`);
  if (from) where.push(`al.created_at >= ${p.add(from)}`);
  if (to) where.push(`al.created_at < ${p.add(to)}::timestamptz + interval '1 day'`);

  const { rows } = await query(
    `SELECT al.*, u.name AS admin_name, u.email AS admin_email, count(*) OVER () AS total
     FROM audit_logs al LEFT JOIN users u ON u.id = al.admin_id
     WHERE ${where.join(' AND ')}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      details: r.details,
      createdAt: r.created_at,
      admin: r.admin_id ? { id: r.admin_id, name: r.admin_name, email: r.admin_email } : null,
    })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

/** Distinct values for the audit log filter dropdowns. */
export async function auditFacets() {
  const { rows } = await query(
    `SELECT array_agg(DISTINCT entity ORDER BY entity) AS entities, array_agg(DISTINCT action ORDER BY action) AS actions FROM audit_logs`,
  );
  const admins = await query(`SELECT id, name FROM users WHERE role = 'admin' ORDER BY name`);
  return { entities: rows[0].entities || [], actions: rows[0].actions || [], admins: admins.rows };
}

/** Compact lists for the admin form dropdowns. */
export async function getOptions() {
  const [cities, categories, labs, tests] = await Promise.all([
    query(
      `SELECT c.id, c.name_en, c.name_bn,
              COALESCE(json_agg(json_build_object('id', a.id, 'nameEn', a.name_en, 'nameBn', a.name_bn) ORDER BY a.name_en)
                       FILTER (WHERE a.id IS NOT NULL), '[]') AS areas
       FROM cities c LEFT JOIN areas a ON a.city_id = c.id
       GROUP BY c.id ORDER BY c.name_en`,
    ),
    query('SELECT id, name_en, name_bn FROM test_categories ORDER BY name_en'),
    query('SELECT id, name, slug, status FROM labs ORDER BY name'),
    query('SELECT id, name_en, name_bn, slug, status FROM tests ORDER BY name_en'),
  ]);
  return {
    cities: cities.rows.map((c) => ({ id: c.id, nameEn: c.name_en, nameBn: c.name_bn, areas: c.areas })),
    categories: categories.rows.map((c) => ({ id: c.id, nameEn: c.name_en, nameBn: c.name_bn })),
    labs: labs.rows,
    tests: tests.rows.map((t) => ({ id: t.id, nameEn: t.name_en, nameBn: t.name_bn, slug: t.slug, status: t.status })),
  };
}
