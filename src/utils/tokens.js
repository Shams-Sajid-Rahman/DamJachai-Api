import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'damjachai';

function requireSecret(name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. Add it to server/.env`);
  return value;
}

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, requireSecret('JWT_ACCESS_SECRET'), {
    subject: String(user.id),
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: ISSUER,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, requireSecret('JWT_ACCESS_SECRET'), { issuer: ISSUER, algorithms: ['HS256'] });
}

export function signRefreshToken(userId) {
  const token = jwt.sign({ type: 'refresh' }, requireSecret('JWT_REFRESH_SECRET'), {
    subject: String(userId),
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    jwtid: randomUUID(), // makes every token unique, even two issued in the same second
    issuer: ISSUER,
    algorithm: 'HS256',
  });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, requireSecret('JWT_REFRESH_SECRET'), { issuer: ISSUER, algorithms: ['HS256'] });
}

/** Refresh tokens are stored only as a SHA-256 hash. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
