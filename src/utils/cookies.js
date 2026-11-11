import { env } from '../config/env.js';

export const REFRESH_COOKIE = 'dj_refresh';

function baseOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/auth', // the cookie is only sent to auth endpoints
  };
}

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
