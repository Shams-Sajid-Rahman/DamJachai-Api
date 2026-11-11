import app from './app.js';
import { env } from './config/env.js';
import { closePool } from './config/db.js';
import { purgeExpiredRefreshTokens } from './services/auth.service.js';

const server = app.listen(env.PORT, () => {
  console.log(`DamJachai API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Housekeeping: remove long-expired refresh tokens on startup.
if (env.DATABASE_URL) {
  purgeExpiredRefreshTokens().catch((err) => console.warn('Could not purge expired tokens:', err.message));
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    closePool().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
