import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import publicRoutes from './public.routes.js';
import communityRoutes from './community.routes.js';
import adminRoutes from './admin/index.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use(publicRoutes);
router.use(communityRoutes);

export default router;
