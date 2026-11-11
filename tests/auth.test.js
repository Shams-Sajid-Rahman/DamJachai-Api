import { afterAll, describe, expect, it } from '@jest/globals';
import { closePool, query } from '../src/config/db.js';
import { api, bearer, loginAdmin, registerUser, uniqueEmail } from './helpers.js';

afterAll(closePool);

const cookieValue = (setCookie) => setCookie?.find((c) => c.startsWith('dj_refresh='))?.split(';')[0];

describe('auth', () => {
  it('registers a user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const email = uniqueEmail('reg');
    const res = await api().post('/api/auth/register').send({ name: 'Rahim', email: email.toUpperCase(), password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, role: 'user', isActive: true });
    expect(res.body.user).not.toHaveProperty('password_hash');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('dj_refresh='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    // only a hash of the refresh token is stored
    const raw = cookieValue(res.headers['set-cookie']).split('=')[1];
    const { rows } = await query('SELECT token_hash FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE u.email = $1', [email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(raw);
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a duplicate email (any letter case) and weak input', async () => {
    const user = await registerUser();
    const dup = await api().post('/api/auth/register').send({ name: 'X Y', email: user.email.toUpperCase(), password: 'password123' });
    expect(dup.status).toBe(409);

    const weak = await api().post('/api/auth/register').send({ name: 'A', email: 'not-an-email', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details).toHaveProperty('email');
    expect(weak.body.error.details).toHaveProperty('password');
    expect(weak.body.error.details).toHaveProperty('name');
  });

  it('logs in with the right password only, with the same error for unknown emails', async () => {
    const user = await registerUser();
    const wrong = await api().post('/api/auth/login').send({ email: user.email, password: 'wrongpass1' });
    const unknown = await api().post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'wrongpass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);

    const ok = await api().post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(ok.status).toBe(200);
    const me = await api().get('/api/auth/me').set(bearer(ok.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  it('protects /me', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    const bad = await api().get('/api/auth/me').set(bearer('not.a.jwt'));
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rotates the refresh token, and a reused old token is rejected', async () => {
    const user = await registerUser();
    const first = cookieValue(user.cookie);

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const second = cookieValue(refreshed.headers['set-cookie']);
    expect(second).not.toBe(first);

    const reused = await api().post('/api/auth/refresh').set('Cookie', first);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_REUSED');

    expect((await api().post('/api/auth/refresh').set('Cookie', second)).status).toBe(200);
  });

  it('revokes every session when an old token is replayed after the grace period', async () => {
    const user = await registerUser();
    const first = cookieValue(user.cookie);
    const refreshed = await api().post('/api/auth/refresh').set('Cookie', first);
    const second = cookieValue(refreshed.headers['set-cookie']);
    // pretend the first token was rotated a minute ago
    await query(`UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE user_id = $1 AND revoked`, [user.user.id]);

    expect((await api().post('/api/auth/refresh').set('Cookie', first)).status).toBe(401);
    // the replay revoked the newer token too
    expect((await api().post('/api/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const user = await registerUser();
    const cookie = cookieValue(user.cookie);
    const out = await api().post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(out.headers['set-cookie'].join(';')).toMatch(/dj_refresh=;/);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('a deactivated user cannot log in or use an old access token', async () => {
    const user = await registerUser();
    const adminToken = await loginAdmin();
    const res = await api().patch(`/api/admin/users/${user.user.id}/status`).set(bearer(adminToken)).send({ isActive: false });
    expect(res.status).toBe(200);

    expect((await api().post('/api/auth/login').send({ email: user.email, password: user.password })).status).toBe(403);
    expect((await api().get('/api/auth/me').set(bearer(user.token))).status).toBe(401);
  });
});
