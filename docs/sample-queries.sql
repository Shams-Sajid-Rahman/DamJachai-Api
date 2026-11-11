-- Handy queries for exploring the seeded (FAKE sample) data.
-- Run with: psql "$DATABASE_URL" -f docs/sample-queries.sql

-- Windows psql defaults to WIN1252. Force UTF-8 so Bangla text works.
\encoding UTF8

-- 1. Every lab that offers CBC, cheapest first
SELECT l.name, c.name_en AS city, a.name_en AS area, lt.price, lt.discounted_price,
       lt.report_hours, l.is_accredited, l.home_collection, lt.last_verified_at::date AS verified
FROM lab_tests lt
JOIN labs l   ON l.id = lt.lab_id
JOIN tests t  ON t.id = lt.test_id
JOIN cities c ON c.id = l.city_id
LEFT JOIN areas a ON a.id = l.area_id
WHERE t.slug = 'cbc'
ORDER BY lt.price;

-- 2. Price spread and possible saving per test
SELECT t.name_en, count(*) AS labs, min(price), max(price), round(avg(price)) AS avg,
       max(price) - min(price) AS saving
FROM lab_tests lt JOIN tests t ON t.id = lt.test_id
GROUP BY t.name_en
ORDER BY saving DESC;

-- 3. Search a test by English name, Bangla name or alias
SELECT DISTINCT t.slug, t.name_en, t.name_bn
FROM tests t
LEFT JOIN test_aliases ta ON ta.test_id = t.id
WHERE t.name_en ILIKE '%' || 'ডেঙ্গু' || '%'
   OR t.name_bn ILIKE '%' || 'ডেঙ্গু' || '%'
   OR ta.alias  ILIKE '%' || 'ডেঙ্গু' || '%';

-- 4. Fuzzy search that tolerates typos (pg_trgm)
SELECT t.slug, max(greatest(similarity(t.name_en, 'cholestrol'), similarity(ta.alias, 'cholestrol'))) AS score
FROM tests t JOIN test_aliases ta ON ta.test_id = t.id
WHERE t.name_en % 'cholestrol' OR ta.alias % 'cholestrol'
GROUP BY t.slug
ORDER BY score DESC;

-- 5. Prices not verified for more than 90 days
SELECT l.name, t.name_en, lt.price, lt.last_verified_at::date
FROM lab_tests lt JOIN labs l ON l.id = lt.lab_id JOIN tests t ON t.id = lt.test_id
WHERE lt.last_verified_at < now() - interval '90 days'
ORDER BY lt.last_verified_at
LIMIT 20;

-- 6. Price history of one lab and test pair
SELECT ph.changed_at::date, ph.old_price, ph.new_price
FROM price_history ph
JOIN lab_tests lt ON lt.id = ph.lab_test_id
JOIN labs l ON l.id = lt.lab_id
JOIN tests t ON t.id = lt.test_id
WHERE l.slug = 'sample-lab-1' AND t.slug = 'mri-brain'
ORDER BY ph.changed_at;

-- 7. Average rating per lab (approved reviews only)
SELECT l.name, round(avg(r.rating), 1) AS rating, count(*) AS reviews
FROM reviews r JOIN labs l ON l.id = r.lab_id
WHERE r.status = 'approved'
GROUP BY l.name
ORDER BY rating DESC;

-- 8. Moderation queues
SELECT 'review' AS kind, count(*) FROM reviews WHERE status = 'pending'
UNION ALL
SELECT 'price_report', count(*) FROM price_reports WHERE status = 'pending';
