import { Router } from 'express';
import * as ctrl from '../controllers/public.controller.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { slugParam } from '../validators/common.js';
import * as v from '../validators/public.validators.js';

const router = Router();

// Tests. /tests/popular must be registered before /tests/:slug.
router.get('/tests', validate({ query: v.searchTestsQuery }), ctrl.searchTests);
router.get('/tests/popular', validate({ query: v.popularQuery }), ctrl.popularTests);
router.get('/tests/:slug', validate({ params: slugParam }), ctrl.getTest);
router.get('/tests/:slug/compare', validate({ params: slugParam, query: v.compareQuery }), ctrl.compareTest);
router.get('/tests/:slug/price-history', validate({ params: slugParam, query: v.priceHistoryQuery }), ctrl.priceHistory);

// Basket
router.post('/basket/compare', validate({ body: v.basketBody }), ctrl.compareBasket);

// Labs. optionalAuth adds `isFavorite` to the lab detail for logged-in users.
router.get('/labs', validate({ query: v.listLabsQuery }), ctrl.listLabs);
router.get('/labs/:slug', optionalAuth, validate({ params: slugParam }), ctrl.getLab);

// Lookups and landing page stats
router.get('/cities', ctrl.listCities);
router.get('/areas', validate({ query: v.areasQuery }), ctrl.listAreas);
router.get('/categories', ctrl.listCategories);
router.get('/stats', ctrl.getStats);

export default router;
