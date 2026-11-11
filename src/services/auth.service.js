import bcrypt from 'bcrypt';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/tokens.js';
import { PUBLIC_USER_COLUMNS, findUserWithPasswordByEmail, toPublicUser } from './user.service.js';

const BCRYPT_ROUNDS = 12;
// A refresh token reused within this window right after rotation is treated as a race between tabs, not as theft.
const REUSE_GRACE_SECONDS = 30;
// Compared against when the email does not exist, so a login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

export async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_USER_COLUMNS}`,
      [name, email, passwordHash],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw ApiError.conflict('An account with this email already exists');
    throw err;
  }
}

export async function authenticate({ email, password }) {
  const user = await findUserWithPasswordByEmail(email);
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

  if (!user || !ok) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

  delete user.password_hash;
  return user;
}

async function storeRefreshToken(client, userId, userAgent) {
  const { token, expiresAt } = signRefreshToken(userId);
  const { rows } = await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, hashToken(token), expiresAt, userAgent?.slice(0, 300) || null],
  );
  return { token, expiresAt, id: rows[0].id };
}

/** Creates an access token and a stored refresh token for a user. */
export async function issueTokens(user, { userAgent } = {}) {
  const refresh = await withTransaction((client) => storeRefreshToken(client, user.id, userAgent));
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

/**
 * Rotation: the presented refresh token is revoked and a new one is issued.
 * If a token that was revoked earlier is presented again (outside the grace window), it was probably stolen,
 * so every session of that user is revoked.
 */
export async function rotateRefreshToken(token, { userAgent } = {}) {
  if (!token) throw ApiError.unauthorized('No refresh token', 'NO_REFRESH_TOKEN');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
  }

  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, rt.revoked, rt.revoked_at, rt.expires_at,
              u.id AS uid, u.name, u.email, u.role, u.is_active, u.created_at
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`,
      [hashToken(token)],
    );
    const stored = rows[0];

    if (!stored || String(stored.user_id) !== payload.sub) {
      throw ApiError.unauthorized('Invalid refresh token', 'REFRESH_INVALID');
    }

    if (stored.revoked) {
      const secondsSinceRevoke = (Date.now() - new Date(stored.revoked_at).getTime()) / 1000;
      if (secondsSinceRevoke > REUSE_GRACE_SECONDS) {
        await client.query(
          'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = now() WHERE user_id = $1 AND revoked = FALSE',
          [stored.user_id],
        );
      }
      // Return instead of throwing, so the transaction commits the revocation above.
      return { reused: true };
    }

    if (new Date(stored.expires_at) < new Date()) {
      throw ApiError.unauthorized('Refresh token expired', 'REFRESH_EXPIRED');
    }
    if (!stored.is_active) {
      throw ApiError.forbidden('This account has been deactivated');
    }

    const next = await storeRefreshToken(client, stored.user_id, userAgent);
    await client.query(
      'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = now(), replaced_by = $2 WHERE id = $1',
      [stored.id, next.id],
    );

    const user = {
      id: stored.uid, name: stored.name, email: stored.email, role: stored.role,
      is_active: stored.is_active, created_at: stored.created_at,
    };
    return {
      user: toPublicUser(user),
      accessToken: signAccessToken(user),
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    };
  });

  if (outcome.reused) throw ApiError.unauthorized('Refresh token was already used', 'REFRESH_REUSED');
  return outcome;
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  await query(
    'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = now() WHERE token_hash = $1 AND revoked = FALSE',
    [hashToken(token)],
  );
}

export async function revokeAllUserTokens(userId, client = { query }) {
  await client.query(
    'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = now() WHERE user_id = $1 AND revoked = FALSE',
    [userId],
  );
}

/** Deletes refresh tokens that expired more than a day ago. Safe to call on startup. */
export async function purgeExpiredRefreshTokens() {
  const { rowCount } = await query("DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'");
  return rowCount;
}
