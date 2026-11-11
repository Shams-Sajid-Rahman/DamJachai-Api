import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { closePool, query } from '../src/config/db.js';
import { api, bearer, loginAdmin, registerUser } from './helpers.js';

afterAll(closePool);

let adminToken;
let userToken;
let adminId;

beforeAll(async () => {
  adminToken = await loginAdmin();
  userToken = (await registerUser()).token;
  adminId = (await api().get('/api/auth/me').set(bearer(adminToken))).body.user.id;
});

const auditCount = async (entity, entityId) =>
  (await query('SELECT count(*)::int AS n FROM audit_logs WHERE entity = $1 AND entity_id = $2', [entity, entityId])).rows[0].n;

describe('admin permissions', () => {
  const routes = [
    ['get', '/api/admin/dashboard'],
    ['get', '/api/admin/labs'],
    ['post', '/api/admin/labs'],
    ['patch', '/api/admin/lab-tests/1'],
    ['delete', '/api/admin/tests/1'],
    ['get', '/api/admin/users'],
    ['get', '/api/admin/audit-logs'],
    ['post', '/api/admin/lab-tests/import'],
  ];

  it.each(routes)('%s %s is 401 for guests and 403 for normal users', async (method, path) => {
    expect((await api()[method](path)).status).toBe(401);
    expect((await api()[method](path).set(bearer(userToken))).status).toBe(403);
  });

  it('admins get no-store responses', async () => {
    const res = await api().get('/api/admin/labs').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('admin CRUD with audit log', () => {
  it('creates, updates and deletes a lab, logging each change', async () => {
    const created = await api().post('/api/admin/labs').set(bearer(adminToken)).send({ name: 'Sample Lab Jest', cityId: 1, isSample: true });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.slug).toBe('sample-lab-jest');

    const updated = await api().patch(`/api/admin/labs/${id}`).set(bearer(adminToken)).send({ phone: '+880 1000-999999', isAccredited: true });
    expect(updated.status).toBe(200);
    const audit = await query(`SELECT action, details FROM audit_logs WHERE entity = 'lab' AND entity_id = $1 ORDER BY id`, [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['create', 'update']);
    expect(audit.rows[1].details.changes).toHaveProperty('isAccredited');

    const removed = await api().delete(`/api/admin/labs/${id}`).set(bearer(adminToken));
    expect(removed.body.data.result).toBe('deleted');
    expect(await auditCount('lab', id)).toBe(3);
  });

  it('validates input and rejects an area from another city', async () => {
    const bad = await api().post('/api/admin/labs').set(bearer(adminToken)).send({ name: 'X', cityId: 'abc' });
    expect(bad.status).toBe(400);
    const { rows } = await query(`SELECT id FROM areas WHERE city_id = 2 LIMIT 1`);
    const wrongArea = await api().post('/api/admin/labs').set(bearer(adminToken)).send({ name: 'Wrong Area Lab', cityId: 1, areaId: rows[0].id });
    expect(wrongArea.status).toBe(400);
  });

  it('hides a lab that has prices instead of deleting it', async () => {
    const { rows } = await query(`SELECT id FROM labs WHERE slug = 'sample-lab-12'`);
    const res = await api().delete(`/api/admin/labs/${rows[0].id}`).set(bearer(adminToken));
    expect(res.body.data.result).toBe('hidden');
    expect((await api().get('/api/labs/sample-lab-12')).status).toBe(404);
    // restore it
    await api().patch(`/api/admin/labs/${rows[0].id}`).set(bearer(adminToken)).send({ status: 'active' });
    expect((await api().get('/api/labs/sample-lab-12')).status).toBe(200);
  });

  it('records old and new price in history when a price changes', async () => {
    const { rows: [lt] } = await query(`SELECT id, price FROM lab_tests ORDER BY id LIMIT 1`);
    const res = await api().patch(`/api/admin/lab-tests/${lt.id}`).set(bearer(adminToken)).send({ price: lt.price + 10, discountedPrice: null });
    expect(res.status).toBe(200);
    const { rows: [h] } = await query('SELECT old_price, new_price, changed_by FROM price_history WHERE lab_test_id = $1 ORDER BY id DESC LIMIT 1', [lt.id]);
    expect(h).toEqual({ old_price: lt.price, new_price: lt.price + 10, changed_by: adminId });
    const tooHighDiscount = await api().patch(`/api/admin/lab-tests/${lt.id}`).set(bearer(adminToken)).send({ discountedPrice: lt.price + 1000 });
    expect(tooHighDiscount.status).toBe(400);
  });

  it('creates a test with aliases that search can find', async () => {
    const res = await api().post('/api/admin/tests').set(bearer(adminToken)).send({
      categoryId: 1, nameEn: 'Jest Ferritin', nameBn: 'ফেরিটিন', aliases: ['ferritin', 'Ferritin', 'iron store test'],
    });
    expect(res.status).toBe(201);
    const search = await api().get('/api/tests').query({ q: 'iron store' });
    expect(search.body.data.map((t) => t.slug)).toContain('jest-ferritin');
    const detail = await api().get(`/api/admin/tests/${res.body.data.id}`).set(bearer(adminToken));
    expect(detail.body.data.aliases).toHaveLength(2); // duplicates are removed, ignoring case
  });

  it('an admin cannot deactivate or demote themselves', async () => {
    expect((await api().patch(`/api/admin/users/${adminId}/status`).set(bearer(adminToken)).send({ isActive: false })).status).toBe(400);
    expect((await api().patch(`/api/admin/users/${adminId}/role`).set(bearer(adminToken)).send({ role: 'user' })).status).toBe(400);
  });
});

describe('CSV import', () => {
  const csv = [
    'lab_slug,test_slug,price,discounted_price,report_hours',
    'sample-lab-1,esr,222,,6',
    'sample-lab-1,esr,223,,6',
    'no-such-lab,cbc,100,,',
    'sample-lab-2,cbc,abc,,',
  ].join('\n');

  it('previews with row errors first and saves nothing until confirmed', async () => {
    const { rows: [before] } = await query(`SELECT lt.price FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id WHERE l.slug = 'sample-lab-1' AND t.slug = 'esr'`);
    const preview = await api().post('/api/admin/lab-tests/import').set(bearer(adminToken)).attach('file', Buffer.from(csv), 'prices.csv');
    expect(preview.status).toBe(200);
    expect(preview.body.data.confirmed).toBe(false);
    expect(preview.body.data.summary).toMatchObject({ total: 4, valid: 1, errors: 3 });
    expect(preview.body.data.rows[0].errors.length).toBeGreaterThan(0); // errors come first
    const { rows: [still] } = await query(`SELECT lt.price FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id WHERE l.slug = 'sample-lab-1' AND t.slug = 'esr'`);
    expect(still.price).toBe(before.price);

    const confirmed = await api().post('/api/admin/lab-tests/import').set(bearer(adminToken)).field('confirm', 'true').attach('file', Buffer.from(csv), 'prices.csv');
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.applied).toMatchObject({ update: 1, skipped: 3 });
    const { rows: [after] } = await query(`SELECT lt.price, lt.source FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id WHERE l.slug = 'sample-lab-1' AND t.slug = 'esr'`);
    expect(after).toEqual({ price: 222, source: 'import' });
    expect((await query(`SELECT count(*)::int AS n FROM audit_logs WHERE entity = 'lab_test' AND action = 'import'`)).rows[0].n).toBeGreaterThan(0);
  });

  it('rejects files that are not CSV or are too large', async () => {
    const pdf = await api().post('/api/admin/lab-tests/import').set(bearer(adminToken)).attach('file', Buffer.from('%PDF'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    const big = Buffer.alloc(1024 * 1024 + 10, 'a');
    const tooBig = await api().post('/api/admin/lab-tests/import').set(bearer(adminToken)).attach('file', big, { filename: 'big.csv', contentType: 'text/csv' });
    expect(tooBig.status).toBe(413);
  });
});
