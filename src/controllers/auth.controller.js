import * as authService from '../services/auth.service.js';
import { toPublicUser } from '../services/user.service.js';
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from '../utils/cookies.js';

function sendSession(res, session, status = 200) {
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

export async function register(req, res) {
  const user = await authService.registerUser(req.valid.body);
  const session = await authService.issueTokens(user, { userAgent: req.get('user-agent') });
  sendSession(res, session, 201);
}

export async function login(req, res) {
  const user = await authService.authenticate(req.valid.body);
  const session = await authService.issueTokens(user, { userAgent: req.get('user-agent') });
  sendSession(res, session);
}

export async function refresh(req, res) {
  try {
    const session = await authService.rotateRefreshToken(req.cookies?.[REFRESH_COOKIE], {
      userAgent: req.get('user-agent'),
    });
    sendSession(res, session);
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: toPublicUser(req.user) });
}
