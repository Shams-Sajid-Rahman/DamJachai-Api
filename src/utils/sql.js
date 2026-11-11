/**
 * Collects query parameters and hands out $1, $2, ... placeholders.
 * SQL text is assembled only from constant fragments and these placeholders.
 * User input always goes into `values`, never into the SQL text.
 *
 *   const p = new SqlParams();
 *   const where = [`l.status = 'active'`];
 *   if (city) where.push(`c.slug = ${p.add(city)}`);
 *   await query(`SELECT ... WHERE ${where.join(' AND ')}`, p.values);
 */
export class SqlParams {
  constructor() {
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Escapes LIKE / ILIKE wildcards so user input is matched literally. */
export function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Picks an ORDER BY clause from a fixed list. Falls back to the first entry for unknown keys. */
export function orderBy(map, key) {
  return Object.hasOwn(map, key) ? map[key] : Object.values(map)[0];
}

export const offsetOf = ({ page, limit }) => (page - 1) * limit;

export function pageMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
