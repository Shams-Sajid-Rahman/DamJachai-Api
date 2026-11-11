import { query } from '../config/db.js';

// Columns that are safe to send to the client. password_hash is never selected here.
export const PUBLIC_USER_COLUMNS = 'id, name, email, role, is_active, created_at';

export async function findUserById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findUserWithPasswordByEmail(email) {
  const { rows } = await query(`SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

export function toPublicUser(user) {
  if (!user) return null;
  const { id, name, email, role, is_active: isActive, created_at: createdAt } = user;
  return { id, name, email, role, isActive, createdAt };
}
