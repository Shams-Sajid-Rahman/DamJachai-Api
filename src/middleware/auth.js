import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { findUserById } from '../services/user.service.js';

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }

  // Load the user on every request, so role changes and deactivation take effect immediately.
  const user = await findUserById(Number(payload.sub));
  if (!user || !user.is_active) {
    throw ApiError.unauthorized('Account not found or deactivated', 'ACCOUNT_INACTIVE');
  }
  return user;
}

export async function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required', 'NO_TOKEN');
  req.user = await resolveUser(token);
  next();
}

/** Attaches req.user if a valid token is sent. Never rejects the request. */
export async function optionalAuth(req, res, next) {
  const token = readBearerToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw ApiError.unauthorized('Authentication required', 'NO_TOKEN');
    if (!roles.includes(req.user.role)) throw ApiError.forbidden('You do not have permission to do this');
    next();
  };
}
