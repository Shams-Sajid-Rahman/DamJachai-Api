import { Router } from 'express';
import * as ctrl from '../controllers/community.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { contributionLimiter } from '../middleware/rateLimiters.js';
import * as v from '../validators/public.validators.js';

// Routes for logged-in users only.
const router = Router();

router.post('/price-reports', requireAuth, contributionLimiter, validate({ body: v.priceReportBody }), ctrl.createPriceReport);
router.get('/price-reports/mine', requireAuth, ctrl.listMyPriceReports);

router.post('/reviews', requireAuth, contributionLimiter, validate({ body: v.reviewBody }), ctrl.upsertReview);
router.get('/reviews/mine/:labId', requireAuth, validate({ params: v.labIdParam }), ctrl.getMyReview);

router.get('/favorites', requireAuth, ctrl.listFavorites);
router.post('/favorites', requireAuth, validate({ body: v.favoriteBody }), ctrl.addFavorite);
router.delete('/favorites/:labId', requireAuth, validate({ params: v.labIdParam }), ctrl.removeFavorite);

export default router;
