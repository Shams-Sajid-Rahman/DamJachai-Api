/**
 * "Sample Lab 13" -> "sample-lab-13". Only ASCII letters and numbers are kept.
 * For text with no ASCII letters (e.g. only Bangla), returns `fallback` plus a short random suffix.
 */
export function slugify(text, fallback = 'item') {
  const slug = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return slug || `${fallback}-${Math.random().toString(36).slice(2, 8)}`;
}
