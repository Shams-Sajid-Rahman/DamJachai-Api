import { query } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { SqlParams, escapeLike, offsetOf, orderBy, pageMeta } from '../../utils/sql.js';
import { revokeAllUserTokens } from '../auth.service.js';
import { audited, DIRECTION, ensureFound } from './helpers.js';

const mapUser = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  isActive: r.is_active,
  createdAt: r.created_at,
  reviewCount: r.review_count,
  reportCount: r.report_count,
});

export async function listUsers({ q, role, isActive, sort, order, page, limit }) {
  const p = new SqlParams();
  const where = ['TRUE'];
  if (q) {
    const c = p.add(`%${escapeLike(q)}%`);
    where.push(`(u.name ILIKE ${c} OR u.email::text ILIKE ${c})`);
  }
  if (role) where.push(`u.role = ${p.add(role)}`);
  if (isActive !== undefined) where.push(`u.is_active = ${p.add(isActive)}`);

  const sortCol = orderBy({ created: 'u.created_at', name: 'u.name', email: 'u.email' }, sort);
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
            (SELECT count(*)::int FROM reviews r WHERE r.user_id = u.id) AS review_count,
            (SELECT count(*)::int FROM price_reports pr WHERE pr.user_id = u.id) AS report_count,
            count(*) OVER () AS total
     FROM users u WHERE ${where.join(' AND ')}
     ORDER BY ${sortCol} ${DIRECTION[order]}, u.id
     LIMIT ${p.add(limit)} OFFSET ${p.add(offsetOf({ page, limit }))}`,
    p.values,
  );
  return { data: rows.map(mapUser), meta: pageMeta({ page, limit }, rows[0]?.total ?? 0) };
}

async function lockUser(client, id) {
  return ensureFound(
    (await client.query('SELECT id, name, email, role, is_active FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0],
    'User not found',
  );
}

/** Stops the change if it would leave the site with no active admin. */
async function assertAnotherActiveAdmin(client, userId) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND id <> $1`,
    [userId],
  );
  if (!rows[0].n) throw ApiError.conflict('This is the last active admin. Make someone else an admin first.');
}

export async function changeRole(adminId, id, role) {
  if (id === adminId) throw ApiError.badRequest('You cannot change your own role');
  return audited(adminId, { action: 'change_role', entity: 'user' }, async (client) => {
    const user = await lockUser(client, id);
    if (user.role === 'admin' && role !== 'admin') await assertAnotherActiveAdmin(client, id);
    await client.query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
    return { result: { id, role }, entityId: id, details: { email: user.email, from: user.role, to: role } };
  });
}

export async function changeStatus(adminId, id, isActive) {
  if (id === adminId && !isActive) throw ApiError.badRequest('You cannot deactivate your own account');
  return audited(adminId, { action: isActive ? 'activate' : 'deactivate', entity: 'user' }, async (client) => {
    const user = await lockUser(client, id);
    if (!isActive && user.role === 'admin') await assertAnotherActiveAdmin(client, id);
    await client.query('UPDATE users SET is_active = $2 WHERE id = $1', [id, isActive]);
    // A deactivated user is logged out everywhere.
    if (!isActive) await revokeAllUserTokens(id, client);
    return { result: { id, isActive }, entityId: id, details: { email: user.email, from: user.is_active, to: isActive } };
  });
}
