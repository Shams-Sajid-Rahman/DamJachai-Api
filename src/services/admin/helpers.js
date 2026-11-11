import { withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';

/** Writes one audit log row. Pass the transaction client, so the log commits together with the change. */
export async function logAudit(client, { adminId, action, entity, entityId = null, details = {} }) {
  await client.query(
    `INSERT INTO audit_logs (admin_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, entity, entityId, JSON.stringify(details)],
  );
}

/**
 * Runs an admin write in a transaction and records it in audit_logs.
 * `fn(client)` must return { result, entityId, details, action? }.
 */
export async function audited(adminId, { action, entity }, fn) {
  return withTransaction(async (client) => {
    const out = await fn(client);
    await logAudit(client, {
      adminId,
      action: out.action || action,
      entity,
      entityId: out.entityId ?? null,
      details: out.details ?? {},
    });
    return out.result;
  });
}

/**
 * Builds "col = $n" SET clauses for the fields in `data` that appear in `columns`
 * (a fixed map like { nameEn: 'name_en' }). Unknown keys are ignored.
 */
export function buildSet(columns, data, params) {
  const sets = [];
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) sets.push(`${column} = ${params.add(data[key])}`);
  }
  return sets;
}

export function ensureFound(row, message = 'Not found') {
  if (!row) throw ApiError.notFound(message);
  return row;
}

/** Which fields actually changed, as { field: { from, to } }. Used in audit details. */
export function diff(before, after, columns) {
  const changes = {};
  for (const [key, column] of Object.entries(columns)) {
    if (after[key] === undefined) continue;
    const from = before[column];
    const to = after[key];
    if (String(from ?? '') !== String(to ?? '')) changes[key] = { from, to };
  }
  return changes;
}

/** Turns a unique-violation into a readable 409. */
export function uniqueConflict(err, message) {
  if (err.code === '23505') throw ApiError.conflict(message, { constraint: err.constraint });
  throw err;
}

export const DIRECTION = { asc: 'ASC', desc: 'DESC' };
