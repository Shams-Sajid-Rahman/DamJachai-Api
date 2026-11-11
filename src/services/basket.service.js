import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { SqlParams } from '../utils/sql.js';
import { mapLab } from '../utils/mappers.js';
import { LAB_SELECT, LAB_JOINS, RATING_LATERAL, EFFECTIVE_PRICE } from './sqlFragments.js';

/**
 * Total basket price per lab. Labs that offer every test ("complete") come first, cheapest first.
 * Labs missing some tests are returned separately as "partial", with the missing test ids.
 */
export async function compareBasket({ testIds, city, area, homeCollection }) {
  const ids = [...new Set(testIds)];

  const { rows: tests } = await query(
    `SELECT id, slug, name_en, name_bn FROM tests WHERE id = ANY($1::int[]) AND status = 'active' ORDER BY name_en`,
    [ids],
  );
  if (tests.length !== ids.length) {
    const found = new Set(tests.map((t) => t.id));
    throw ApiError.badRequest('Some tests were not found', { testIds: ids.filter((id) => !found.has(id)) });
  }

  const p = new SqlParams();
  const idsPh = p.add(ids);
  const where = [`l.status = 'active'`];
  if (city) where.push(`c.slug = ${p.add(city)}`);
  if (area) where.push(`a.slug = ${p.add(area)}`);
  if (homeCollection !== undefined) where.push(`l.home_collection = ${p.add(homeCollection)}`);

  const { rows } = await query(
    `SELECT ${LAB_SELECT}, r.avg_rating, r.review_count,
            count(lt.test_id)::int AS matched,
            sum(${EFFECTIVE_PRICE}) AS total,
            sum(lt.price) AS total_before_discount,
            max(lt.report_hours) AS max_report_hours,
            min(lt.last_verified_at) AS oldest_verified_at,
            json_agg(json_build_object(
              'testId', lt.test_id, 'labTestId', lt.id, 'price', lt.price, 'discountedPrice', lt.discounted_price,
              'effectivePrice', ${EFFECTIVE_PRICE}, 'reportHours', lt.report_hours, 'lastVerifiedAt', lt.last_verified_at
            ) ORDER BY lt.test_id) AS items
     FROM labs l
     JOIN lab_tests lt ON lt.lab_id = l.id AND lt.test_id = ANY(${idsPh}::int[])
     ${LAB_JOINS}
     ${RATING_LATERAL}
     WHERE ${where.join(' AND ')}
     GROUP BY l.id, c.id, a.id, r.avg_rating, r.review_count
     ORDER BY matched DESC, total ASC`,
    p.values,
  );

  const toResult = (row) => {
    const offered = new Set(row.items.map((i) => i.testId));
    return {
      lab: mapLab(row),
      matched: row.matched,
      total: Number(row.total),
      totalBeforeDiscount: Number(row.total_before_discount),
      maxReportHours: row.max_report_hours,
      oldestVerifiedAt: row.oldest_verified_at,
      items: row.items,
      missingTestIds: ids.filter((id) => !offered.has(id)),
    };
  };

  const complete = rows.filter((r) => r.matched === ids.length).map(toResult);
  const partial = rows.filter((r) => r.matched < ids.length).map(toResult);
  const totals = complete.map((c) => c.total);

  return {
    tests: tests.map((t) => ({ id: t.id, slug: t.slug, nameEn: t.name_en, nameBn: t.name_bn })),
    complete,
    partial,
    stats: {
      labsWithAll: complete.length,
      cheapestTotal: totals.length ? Math.min(...totals) : null,
      highestTotal: totals.length ? Math.max(...totals) : null,
      saving: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
    },
  };
}
