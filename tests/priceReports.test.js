import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { closePool, query } from '../src/config/db.js';
import { api, bearer, loginAdmin, registerUser } from './helpers.js';

afterAll(closePool);

let user;
let adminToken;
let labId;
let testId;

beforeAll(async () => {
  user = await registerUser();
  adminToken = await loginAdmin();
  const { rows } = await query(
    `SELECT lt.lab_id, lt.test_id FROM lab_tests lt JOIN tests t ON t.id = lt.test_id WHERE t.slug = 'widal-test' ORDER BY lt.id LIMIT 1`,
  );
  ({ lab_id: labId, test_id: testId } = rows[0]);
});

describe('price reports', () => {
  it('requires login and valid input', async () => {
    expect((await api().post('/api/price-reports').send({ labId, testId, reportedPrice: 100 })).status).toBe(401);
    const bad = await api().post('/api/price-reports').set(bearer(user.token)).send({ labId, testId, reportedPrice: -5 });
    expect(bad.status).toBe(400);
  });

  it('approving a report updates the price, writes history and an audit log', async () => {
    const created = await api().post('/api/price-reports').set(bearer(user.token)).send({ labId, testId, reportedPrice: 333, note: 'test' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('pending');

    // a second pending report for the same lab and test is refused
    expect((await api().post('/api/price-reports').set(bearer(user.token)).send({ labId, testId, reportedPrice: 334 })).status).toBe(409);

    const reportId = created.body.data.id;
    const { rows: [before] } = await query('SELECT id, price FROM lab_tests WHERE lab_id = $1 AND test_id = $2', [labId, testId]);
    const historyBefore = (await query('SELECT count(*)::int AS n FROM price_history WHERE lab_test_id = $1', [before.id])).rows[0].n;

    // a normal user cannot approve
    expect((await api().post(`/api/admin/price-reports/${reportId}/approve`).set(bearer(user.token))).status).toBe(403);

    const approved = await api().post(`/api/admin/price-reports/${reportId}/approve`).set(bearer(adminToken)).send({ note: 'checked' });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: 'approved', oldPrice: before.price, newPrice: 333 });

    const { rows: [after] } = await query('SELECT price, source, last_verified_at FROM lab_tests WHERE id = $1', [before.id]);
    expect(after.price).toBe(333);
    expect(after.source).toBe('user_report');
    expect(Date.now() - new Date(after.last_verified_at).getTime()).toBeLessThan(60_000);

    const history = await query('SELECT old_price, new_price FROM price_history WHERE lab_test_id = $1 ORDER BY id DESC', [before.id]);
    expect(history.rows).toHaveLength(historyBefore + 1);
    expect(history.rows[0]).toEqual({ old_price: before.price, new_price: 333 });

    const audit = await query(`SELECT action, details FROM audit_logs WHERE entity = 'price_report' AND entity_id = $1`, [reportId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe('approve');
    expect(audit.rows[0].details.appliedPrice).toBe(333);

    // it cannot be approved twice
    expect((await api().post(`/api/admin/price-reports/${reportId}/approve`).set(bearer(adminToken))).status).toBe(409);

    // the user sees the result
    const mine = await api().get('/api/price-reports/mine').set(bearer(user.token));
    expect(mine.body.data.find((r) => r.id === reportId)).toMatchObject({ status: 'approved', reviewNote: 'checked' });
  });

  it('rejecting a report leaves the price unchanged', async () => {
    const created = await api().post('/api/price-reports').set(bearer(user.token)).send({ labId, testId, reportedPrice: 999 });
    const { rows: [before] } = await query('SELECT price FROM lab_tests WHERE lab_id = $1 AND test_id = $2', [labId, testId]);
    const rejected = await api().post(`/api/admin/price-reports/${created.body.data.id}/reject`).set(bearer(adminToken)).send({ note: 'no proof' });
    expect(rejected.status).toBe(200);
    const { rows: [after] } = await query('SELECT price FROM lab_tests WHERE lab_id = $1 AND test_id = $2', [labId, testId]);
    expect(after.price).toBe(before.price);
  });
});

describe('reviews', () => {
  it('a new review is pending until an admin approves it', async () => {
    const lab = await query(`SELECT id, slug FROM labs WHERE slug = 'sample-lab-12'`);
    const { id, slug } = lab.rows[0];
    const res = await api().post('/api/reviews').set(bearer(user.token)).send({ labId: id, rating: 5, comment: 'Test review text' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');

    const pub = await api().get(`/api/labs/${slug}`);
    expect(pub.body.data.reviews.some((r) => r.comment === 'Test review text')).toBe(false);

    await api().post(`/api/admin/reviews/${res.body.data.id}/approve`).set(bearer(adminToken)).send({});
    const after = await api().get(`/api/labs/${slug}`);
    expect(after.body.data.reviews.some((r) => r.comment === 'Test review text')).toBe(true);
  });
});
