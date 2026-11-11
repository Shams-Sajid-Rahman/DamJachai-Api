// SQL fragments shared by several services. They are constants, with no user input inside.

/** Lab columns aliased so mapLab() can read them. Needs `labs l`, `cities c` and `LEFT JOIN areas a`. */
export const LAB_SELECT = `
  l.id AS lab_id, l.name AS lab_name, l.slug AS lab_slug, l.address, l.phone, l.website,
  l.latitude, l.longitude, l.opening_hours, l.is_accredited, l.accreditation_note,
  l.home_collection, l.home_collection_fee, l.is_sample,
  c.id AS city_id, c.slug AS city_slug, c.name_en AS city_name_en, c.name_bn AS city_name_bn,
  a.id AS area_id, a.slug AS area_slug, a.name_en AS area_name_en, a.name_bn AS area_name_bn`;

export const LAB_JOINS = `
  JOIN cities c ON c.id = l.city_id
  LEFT JOIN areas a ON a.id = l.area_id`;

/** Average rating and review count of approved reviews (adds r.avg_rating and r.review_count). */
export const RATING_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT round(avg(rv.rating)::numeric, 1) AS avg_rating, count(*)::int AS review_count
    FROM reviews rv
    WHERE rv.lab_id = l.id AND rv.status = 'approved'
  ) r ON TRUE`;

/** The price a customer actually pays: the discounted price when there is one. */
export const EFFECTIVE_PRICE = 'COALESCE(lt.discounted_price, lt.price)';
