import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();

// Every /api/admin route requires a logged-in admin.
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, admin: { id: req.user.id, name: req.user.name } });
});

export default router;
