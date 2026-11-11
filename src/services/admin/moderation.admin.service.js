// Review and price report moderation queues.
import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, pageMeta } from '../../utils/sql.js';
import { audited, DIRECTION, ensureFound } from './helpers.js';
import { upsertPrice } from './prices.admin.service.js';

// ---------- Reviews ----------

export async function listReviews({ status, q, labId, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (status !== 'all') where.push(`rv.status = ${p.add(status)}`);
  if (labId) where.push(`rv.lab_id = ${p.add(labId)}`);
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(rv.comment ILIKE ${c} OR u.name ILIKE ${c} OR u.email::text ILIKE ${c} OR l.name ILIKE ${c})`);
  }
  const { rows } = await query(
    `SELECT rv.*, u.name AS user_name, u.email AS user_email, l.name AS lab_name, l.slug AS lab_slug,
            m.name AS reviewer_name, count(*) OVER () AS total
     FROM reviews rv
     JOIN users u ON u.id = rv.user_id
     JOIN labs l ON l.id = rv.lab_id
     LEFT JOIN users m ON m.id = rv.reviewed_by
     WHERE ${where.join(' AND ')}
     ORDER BY rv.created_at ${DIRECTION[order]}, rv.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      reportOnTime: r.report_on_time,
      comment: r.comment,
      status: r.status,
      reviewNote: r.review_note,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reviewedBy: r.reviewer_name,
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      lab: { id: r.lab_id, name: r.lab_name, slug: r.lab_slug },
    })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

async function setReviewStatus(adminId, id, status, note) {
  return audited(adminId, { action: status === 'approved' ? 'approve' : 'reject', entity: 'review' }, async (client) => {
    const review = ensureFound((await client.query('SELECT * FROM reviews WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Review not found');
    await client.query(
      'UPDATE reviews SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1',
      [id, status, note ?? null, adminId],
    );
    return { result: { id, status }, entityId: id, details: { labId: review.lab_id, from: review.status, to: status, note: note ?? null } };
  });
}

export const approveReview = (adminId, id, { note } = {}) => setReviewStatus(adminId, id, 'approved', note);
export const rejectReview = (adminId, id, { note } = {}) => setReviewStatus(adminId, id, 'rejected', note);

export async function deleteReview(adminId, id) {
  return audited(adminId, { action: 'delete', entity: 'review' }, async (client) => {
    const review = ensureFound((await client.query('SELECT * FROM reviews WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Review not found');
    await client.query('DELETE FROM reviews WHERE id = $1', [id]);
    return {
      result: { id, result: 'deleted' },
      entityId: id,
      details: { labId: review.lab_id, userId: review.user_id, rating: review.rating, comment: review.comment },
    };
  });
}

// ---------- Price reports ----------

export async function listPriceReports({ status, q, labId, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (status !== 'all') where.push(`pr.status = ${p.add(status)}`);
  if (labId) where.push(`pr.lab_id = ${p.add(labId)}`);
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(pr.note ILIKE ${c} OR u.name ILIKE ${c} OR l.name ILIKE ${c} OR t.name_en ILIKE ${c} OR t.name_bn ILIKE ${c})`);
  }
  const { rows } = await query(
    `SELECT pr.*, u.name AS user_name, u.email AS user_email,
            l.name AS lab_name, l.slug AS lab_slug, t.name_en AS test_name_en, t.name_bn AS test_name_bn, t.slug AS test_slug,
            lt.price AS current_price, lt.discounted_price AS current_discounted_price, lt.last_verified_at AS current_verified_at,
            m.name AS reviewer_name, count(*) OVER () AS total
     FROM price_reports pr
     JOIN users u ON u.id = pr.user_id
     JOIN labs l ON l.id = pr.lab_id
     JOIN tests t ON t.id = pr.test_id
     LEFT JOIN lab_tests lt ON lt.lab_id = pr.lab_id AND lt.test_id = pr.test_id
     LEFT JOIN users m ON m.id = pr.reviewed_by
     WHERE ${where.join(' AND ')}
     ORDER BY pr.created_at ${DIRECTION[order]}, pr.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return {
    data: rows.map((r) => ({
      id: r.id,
      reportedPrice: r.reported_price,
      note: r.note,
      status: r.status,
      reviewNote: r.review_note,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reviewedBy: r.reviewer_name,
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      lab: { id: r.lab_id, name: r.lab_name, slug: r.lab_slug },
      test: { id: r.test_id, nameEn: r.test_name_en, nameBn: r.test_name_bn, slug: r.test_slug },
      current: r.current_price == null ? null : {
        price: r.current_price,
        discountedPrice: r.current_discounted_price,
        lastVerifiedAt: r.current_verified_at,
      },
    })),
    meta: pageMeta({ page, limit }, rows[0]?.total ?? 0),
  };
}

async function lockPendingReport(client, id) {
  const report = ensureFound((await client.query('SELECT * FROM price_reports WHERE id = $1 FOR UPDATE', [id])).rows[0], 'Price report not found');
  if (report.status !== 'pending') throw ApiError.conflict(`This report was already ${report.status}`);
  return report;
}

/**
 * Approving a report updates the real price (or creates it), writes price history and resets last_verified_at.
 * The discount is cleared because the report gives the price actually paid.
 */
export async function approvePriceReport(adminId, id, { note, price } = {}) {
  return audited(adminId, { action: 'approve', entity: 'price_report' }, async (client) => {
    const report = await lockPendingReport(client, id);
    const finalPrice = price ?? report.reported_price;
    const out = await upsertPrice(client, {
      labId: report.lab_id,
      testId: report.test_id,
      price: finalPrice,
      discountedPrice: null,
      source: 'user_report',
      adminId,
    });
    await client.query(
      `UPDATE price_reports SET status = 'approved', review_note = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [id, note ?? null, adminId],
    );
    return {
      result: { id, status: 'approved', labTestId: out.id, priceAction: out.action, oldPrice: out.oldPrice, newPrice: finalPrice },
      entityId: id,
      details: { labId: report.lab_id, testId: report.test_id, reportedPrice: report.reported_price, appliedPrice: finalPrice, oldPrice: out.oldPrice, note: note ?? null },
    };
  });
}

export async function rejectPriceReport(adminId, id, { note } = {}) {
  return audited(adminId, { action: 'reject', entity: 'price_report' }, async (client) => {
    const report = await lockPendingReport(client, id);
    await client.query(
      `UPDATE price_reports SET status = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [id, note ?? null, adminId],
    );
    return { result: { id, status: 'rejected' }, entityId: id, details: { labId: report.lab_id, testId: report.test_id, note: note ?? null } };
  });
}
