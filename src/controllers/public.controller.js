import * as testsService from '../services/tests.service.js';
import * as labsService from '../services/labs.service.js';
import * as basketService from '../services/basket.service.js';
import * as metaService from '../services/meta.service.js';

// Public, read-only endpoints. Short cache headers let browsers and CDNs absorb repeat visits.
const cache = (res, seconds) => res.set('Cache-Control', `public, max-age=${seconds}`);

export async function searchTests(req, res) {
  res.json(await testsService.searchTests(req.valid.query));
}

export async function popularTests(req, res) {
  cache(res, 60);
  res.json({ data: await testsService.popularTests(req.valid.query) });
}

export async function getTest(req, res) {
  res.json({ data: await testsService.findActiveTestBySlug(req.valid.params.slug) });
}

export async function compareTest(req, res) {
  res.json(await testsService.compareTest(req.valid.params.slug, req.valid.query));
}

export async function priceHistory(req, res) {
  res.json(await testsService.priceHistory(req.valid.params.slug, req.valid.query));
}

export async function compareBasket(req, res) {
  res.json(await basketService.compareBasket(req.valid.body));
}

export async function listLabs(req, res) {
  res.json(await labsService.listLabs(req.valid.query));
}

export async function getLab(req, res) {
  res.json({ data: await labsService.getLabBySlug(req.valid.params.slug, { userId: req.user?.id }) });
}

export async function listCities(req, res) {
  cache(res, 300);
  res.json({ data: await metaService.listCities() });
}

export async function listAreas(req, res) {
  cache(res, 300);
  res.json({ data: await metaService.listAreas(req.valid.query) });
}

export async function listCategories(req, res) {
  cache(res, 300);
  res.json({ data: await metaService.listCategories() });
}

export async function getStats(req, res) {
  cache(res, 60);
  res.json({ data: await metaService.getStats() });
}
