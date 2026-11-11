import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { mapLab } from '../utils/mappers.js';
import { LAB_SELECT, LAB_JOINS, RATING_LATERAL } from './sqlFragments.js';
import { findActiveLab } from './labs.service.js';

async function findActiveTest(testId) {
  const { rows } = await query(`SELECT id FROM tests WHERE id = $1 AND status = 'active'`, [testId]);
  if (!rows[0]) throw ApiError.notFound('Test not found');
  return rows[0];
}

// ---------- Price reports ----------

export async function createPriceReport(userId, { labId, testId, reportedPrice, note }) {
  await Promise.all([findActiveLab(labId), findActiveTest(testId)]);

  // Stop duplicate pending reports for the same lab and test from the same user.
  const dup = await query(
    `SELECT id FROM price_reports WHERE user_id = $1 AND lab_id = $2 AND test_id = $3 AND status = 'pending'`,
    [userId, labId, testId],
  );
  if (dup.rowCount) {
    throw ApiError.conflict('You already have a pending report for this test at this lab');
  }

  const { rows } = await query(
    `INSERT INTO price_reports (user_id, lab_id, test_id, reported_price, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, lab_id, test_id, reported_price, note, status, created_at`,
    [userId, labId, testId, reportedPrice, note || null],
  );
  const r = rows[0];
  return { id: r.id, labId: r.lab_id, testId: r.test_id, reportedPrice: r.reported_price, note: r.note, status: r.status, createdAt: r.created_at };
}

export async function listMyPriceReports(userId) {
  const { rows } = await query(
    `SELECT pr.id, pr.reported_price, pr.note, pr.status, pr.review_note, pr.created_at, pr.reviewed_at,
            l.name AS lab_name, l.slug AS lab_slug, t.name_en, t.name_bn, t.slug AS test_slug
     FROM price_reports pr
     JOIN labs l ON l.id = pr.lab_id
     JOIN tests t ON t.id = pr.test_id
     WHERE pr.user_id = $1
     ORDER BY pr.created_at DESC
     LIMIT 100`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    reportedPrice: r.reported_price,
    note: r.note,
    status: r.status,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    lab: { name: r.lab_name, slug: r.lab_slug },
    test: { slug: r.test_slug, nameEn: r.name_en, nameBn: r.name_bn },
  }));
}

// ---------- Reviews ----------

/** One review per user per lab. Writing again replaces the old review and sends it back to moderation. */
export async function upsertReview(userId, { labId, rating, reportOnTime, comment }) {
  await findActiveLab(labId);
  const { rows, } = await query(
    `INSERT INTO reviews (user_id, lab_id, rating, report_on_time, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT reviews_user_lab_uq DO UPDATE
       SET rating = EXCLUDED.rating,
           report_on_time = EXCLUDED.report_on_time,
           comment = EXCLUDED.comment,
           status = 'pending',
           reviewed_by = NULL,
           reviewed_at = NULL
     RETURNING id, lab_id, rating, report_on_time, comment, status, created_at, (xmax = 0) AS inserted`,
    [userId, labId, rating, reportOnTime ?? null, comment || null],
  );
  const r = rows[0];
  return {
    review: { id: r.id, labId: r.lab_id, rating: r.rating, reportOnTime: r.report_on_time, comment: r.comment, status: r.status, createdAt: r.created_at },
    created: r.inserted,
  };
}

export async function getMyReviewForLab(userId, labId) {
  const { rows } = await query(
    `SELECT id, rating, report_on_time, comment, status, created_at FROM reviews WHERE user_id = $1 AND lab_id = $2`,
    [userId, labId],
  );
  const r = rows[0];
  return r ? { id: r.id, rating: r.rating, reportOnTime: r.report_on_time, comment: r.comment, status: r.status, createdAt: r.created_at } : null;
}

// ---------- Favorites ----------

export async function listFavorites(userId) {
  const { rows } = await query(
    `SELECT ${LAB_SELECT}, r.avg_rating, r.review_count, f.created_at AS favorited_at,
            (SELECT count(*)::int FROM lab_tests lt WHERE lt.lab_id = l.id) AS test_count
     FROM favorites f
     JOIN labs l ON l.id = f.lab_id AND l.status = 'active'
     ${LAB_JOINS}
     ${RATING_LATERAL}
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({ ...mapLab(row), testCount: row.test_count, favoritedAt: row.favorited_at }));
}

export async function addFavorite(userId, labId) {
  await findActiveLab(labId);
  await query('INSERT INTO favorites (user_id, lab_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, labId]);
}

export async function removeFavorite(userId, labId) {
  await query('DELETE FROM favorites WHERE user_id = $1 AND lab_id = $2', [userId, labId]);
}
