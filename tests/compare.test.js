import { afterAll, describe, expect, it } from '@jest/globals';
import { closePool, query } from '../src/config/db.js';
import { api } from './helpers.js';

afterAll(closePool);

const slugs = (res) => res.body.data.map((t) => t.slug);

describe('test search', () => {
  it('finds a test by alias, English name and Bangla name', async () => {
    expect(slugs(await api().get('/api/tests').query({ q: 'CBC' }))[0]).toBe('cbc');
    expect(slugs(await api().get('/api/tests').query({ q: 'complete blood count' }))[0]).toBe('cbc');
    expect(slugs(await api().get('/api/tests').query({ q: 'সিবিসি' }))).toEqual(['cbc']);
    expect(slugs(await api().get('/api/tests').query({ q: 'ডেঙ্গু' }))).toEqual(expect.arrayContaining(['dengue-ns1', 'dengue-igg-igm']));
  });

  it('tolerates typos in English', async () => {
    expect(slugs(await api().get('/api/tests').query({ q: 'cholestrol' }))).toContain('lipid-profile');
  });

  it('treats % and _ in the query literally', async () => {
    const res = await api().get('/api/tests').query({ q: '%_%' });
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  it('filters by category and paginates', async () => {
    const page1 = await api().get('/api/tests').query({ category: 'radiology', limit: 2, page: 1 });
    const page2 = await api().get('/api/tests').query({ category: 'radiology', limit: 2, page: 2 });
    expect(page1.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(page1.body.data.every((t) => t.category.slug === 'radiology')).toBe(true);
    expect(slugs(page1).some((s) => slugs(page2).includes(s))).toBe(false);
  });

  it('validates query params', async () => {
    expect((await api().get('/api/tests').query({ limit: 1000 })).status).toBe(400);
  });
});

describe('compare', () => {
  it('returns every lab sorted by price, with correct stats and the cheapest flagged', async () => {
    const res = await api().get('/api/tests/cbc/compare');
    expect(res.status).toBe(200);
    const prices = res.body.results.map((r) => r.effectivePrice);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const { stats } = res.body;
    expect(stats.minPrice).toBe(Math.min(...prices));
    expect(stats.maxPrice).toBe(Math.max(...prices));
    expect(stats.saving).toBe(stats.maxPrice - stats.minPrice);
    expect(res.body.results[0].isCheapest).toBe(true);
    expect(res.body.results[0].savingVsMax).toBe(stats.saving);
    expect(res.body.results[0].lab).toMatchObject({ isSample: true, rating: expect.any(Object), city: expect.any(Object) });
  });

  it('applies combined filters', async () => {
    const res = await api().get('/api/tests/cbc/compare').query({ city: 'dhaka', homeCollection: true, accredited: true, sort: 'rating' });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    for (const r of res.body.results) {
      expect(r.lab.city.slug).toBe('dhaka');
      expect(r.lab.homeCollection).toBe(true);
      expect(r.lab.isAccredited).toBe(true);
    }
    const ratings = res.body.results.map((r) => r.lab.rating.average ?? 0);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('reflects database changes right away', async () => {
    const before = await api().get('/api/tests/esr/compare');
    const target = before.body.results.at(-1);
    await query('UPDATE lab_tests SET price = 1, discounted_price = NULL WHERE id = $1', [target.labTestId]);
    const after = await api().get('/api/tests/esr/compare');
    expect(after.body.results[0].labTestId).toBe(target.labTestId);
    expect(after.body.stats.minPrice).toBe(1);
    await query('UPDATE lab_tests SET price = $2, discounted_price = $3 WHERE id = $1', [target.labTestId, target.price, target.discountedPrice]);
  });

  it('hides hidden labs and returns 404 for unknown tests', async () => {
    expect((await api().get('/api/tests/no-such-test/compare')).status).toBe(404);
    expect((await api().get('/api/tests/cbc/compare').query({ sort: 'drop table' })).status).toBe(400);
  });

  it('returns the price history of a lab', async () => {
    const compare = await api().get('/api/tests/mri-brain/compare');
    const labId = compare.body.results[0].lab.id;
    const res = await api().get('/api/tests/mri-brain/price-history').query({ labId });
    expect(res.status).toBe(200);
    expect(res.body.points.length).toBeGreaterThan(0);
    expect(res.body.points.every((p) => p.lab.id === labId)).toBe(true);
  });
});

describe('basket', () => {
  const ids = async (...slugList) => {
    const { rows } = await query('SELECT id FROM tests WHERE slug = ANY($1::text[])', [slugList]);
    return rows.map((r) => r.id);
  };

  it('returns totals for labs that offer every test, cheapest first', async () => {
    const testIds = await ids('cbc', 'hba1c', 'lipid-profile', 'mri-brain');
    const res = await api().post('/api/basket/compare').send({ testIds });
    expect(res.status).toBe(200);
    expect(res.body.complete.length).toBeGreaterThan(0);
    const totals = res.body.complete.map((c) => c.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    for (const c of res.body.complete) {
      expect(c.items).toHaveLength(testIds.length);
      expect(c.total).toBeCloseTo(c.items.reduce((s, i) => s + i.effectivePrice, 0), 2);
      expect(c.missingTestIds).toEqual([]);
    }
    for (const p of res.body.partial) expect(p.missingTestIds.length).toBeGreaterThan(0);
    expect(res.body.stats.saving).toBe(Math.max(...totals) - Math.min(...totals));
  });

  it('validates the basket', async () => {
    expect((await api().post('/api/basket/compare').send({ testIds: [] })).status).toBe(400);
    expect((await api().post('/api/basket/compare').send({ testIds: [999999] })).status).toBe(400);
    expect((await api().post('/api/basket/compare').send({ testIds: ['1; DROP TABLE tests'] })).status).toBe(400);
  });
});
