import { Router } from 'express';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

const router = Router();

async function checkDatabase() {
  if (!env.DATABASE_URL) return 'not_configured';
  try {
    await query('SELECT 1');
    return 'ok';
  } catch {
    return 'down';
  }
}

router.get('/', async (req, res) => {
  const database = await checkDatabase();
  const healthy = database !== 'down';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'damjachai-api',
    database,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
