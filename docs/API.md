# DamJachai API

Base URL: `http://localhost:5000/api`. All bodies are JSON, except the CSV upload.

**Errors** look like `{ "error": { "message": "...", "code": "VALIDATION_ERROR", "details": { "field": ["..."] } } }`.
Status codes: `400` validation, `401` not logged in or bad token, `403` wrong role or deactivated, `404`, `409` conflict
(duplicate, still in use, already moderated), `413` too large, `429` rate limited.

**Auth.** Send `Authorization: Bearer <accessToken>`. The access token lasts 15 minutes. The refresh token lasts 7 days and
lives in the httpOnly cookie `dj_refresh` (path `/api/auth`).

**Lists** take `page` (default 1) and `limit` (default 20, at most 100) and return `{ data: [...], meta: { page, limit, total, totalPages } }`.

## Health

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | `{ status, database, uptime }`. Returns 503 if the database is down |

## Auth

| Method | Path | Body / notes |
|--------|------|--------------|
| POST | `/auth/register` | `{ name, email, password }`. The password needs 8 to 72 characters with a letter and a number. Rate limit: 10 per hour per IP |
| POST | `/auth/login` | `{ email, password }`. Rate limit: 10 per 15 minutes per IP |
| POST | `/auth/refresh` | Uses the cookie. Rotates the refresh token. A reused old token revokes all of that user's sessions |
| POST | `/auth/logout` | Revokes the refresh token and clears the cookie (204) |
| GET | `/auth/me` | Requires a logged-in user |

Login, register and refresh return `{ user, accessToken }` and set the cookie.

## Public

| Method | Path | Query / body |
|--------|------|--------------|
| GET | `/tests` | `q` (Bangla, English, alias; typo-tolerant for English), `category` (slug), `page`, `limit` |
| GET | `/tests/popular` | `limit` (default 8). Ranked by views, then by the number of labs with a price |
| GET | `/tests/:slug` | Test details, aliases and price stats |
| GET | `/tests/:slug/compare` | `city`, `area` (slugs), `homeCollection`, `accredited` (true/false), `minRating` (1–5), `sort` = `price_asc` \| `price_desc` \| `rating` \| `report_time`. Returns `{ test, stats: { count, minPrice, maxPrice, avgPrice, saving, cheapestLabId }, results: [...] }` |
| GET | `/tests/:slug/price-history` | `labId` (optional). Returns `{ test, points: [{ oldPrice, newPrice, changedAt, lab }] }` |
| POST | `/basket/compare` | `{ testIds: number[] (1–25), city?, area?, homeCollection? }`. Returns `{ tests, complete: [...], partial: [...], stats }`. `complete` holds the labs that offer every test, cheapest first. Each `partial` lab lists its `missingTestIds` |
| GET | `/labs` | `q`, `city`, `area`, `homeCollection`, `accredited`, `minRating`, `sort` = `name` \| `rating` \| `tests` \| `newest`, `page`, `limit` |
| GET | `/labs/:slug` | Lab details, its tests with prices, approved reviews, and `isFavorite` when logged in |
| GET | `/cities` | Cities with their areas and lab counts |
| GET | `/areas` | `city` (slug, optional) |
| GET | `/categories` | Categories with test counts |
| GET | `/stats` | `{ labs, tests, cities, prices, verifiedPrices (last 90 days), reviews, lastVerifiedAt }` |

## Logged-in users

| Method | Path | Body / notes |
|--------|------|--------------|
| POST | `/price-reports` | `{ labId, testId, reportedPrice, note? }`. Starts as `pending`. One pending report per user, lab and test |
| GET | `/price-reports/mine` | The user's reports and their status |
| POST | `/reviews` | `{ labId, rating (1–5), reportOnTime?, comment? }`. One review per user per lab; posting again replaces it and sends it back to `pending` |
| GET | `/reviews/mine/:labId` | The user's review for a lab |
| GET | `/favorites` | The user's favorite labs |
| POST | `/favorites` | `{ labId }` |
| DELETE | `/favorites/:labId` | 204 |

Price reports and reviews: 30 per hour per IP.

## Admin (`/admin/*`, admin role only, `Cache-Control: no-store`)

Every write creates an `audit_logs` row in the same transaction.

| Resource | Endpoints | Notes |
|----------|-----------|-------|
| Dashboard | `GET /admin/dashboard` | Totals, pending items, recent prices, labs with the oldest prices, prices per category, 14-day activity |
| Options | `GET /admin/options` | Compact lists of cities with areas, categories, labs and tests, for form dropdowns |
| Cities | `GET/POST /admin/cities`, `PATCH/DELETE /admin/cities/:id` | Deleting returns 409 while the city has areas or labs |
| Areas | `GET/POST /admin/areas`, `PATCH/DELETE /admin/areas/:id` | `cityId` filter. Deleting returns 409 while labs use the area |
| Categories | `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/:id` | Deleting returns 409 while the category has tests |
| Labs | `GET/POST /admin/labs`, `GET/PATCH/DELETE /admin/labs/:id` | Filters: `q`, `cityId`, `areaId`, `status`. Sorts: `name`, `created`, `updated`, `prices`, `oldest_verified`. **DELETE hides** a lab that has prices, reviews, reports or favorites (`result: "hidden"`) |
| Tests | `GET/POST /admin/tests`, `GET/PATCH/DELETE /admin/tests/:id` | Has `aliases: string[]` (duplicates removed, ignoring case). DELETE hides a test that has prices or reports |
| Lab prices | `GET/POST /admin/lab-tests`, `GET/PATCH/DELETE /admin/lab-tests/:id`, `POST /admin/lab-tests/:id/verify` | Filters: `q`, `labId`, `testId`, `source`, `staleDays`. A price change writes `price_history`. Every save sets `last_verified_at = now()` |
| CSV import | `POST /admin/lab-tests/import` (multipart: `file`, optional `confirm=true`), `GET /admin/lab-tests/import/template` | Columns `lab_slug,test_slug,price,discounted_price,report_hours`. Up to 1 MB and 2,000 rows. Without `confirm` it returns a preview (rows with errors first) and saves nothing. With `confirm` it saves the valid rows in one transaction |
| Users | `GET /admin/users`, `PATCH /admin/users/:id/role` `{ role }`, `PATCH /admin/users/:id/status` `{ isActive }` | You cannot change your own account. The last active admin cannot be removed. Deactivating revokes all of that user's sessions |
| Reviews | `GET /admin/reviews?status=pending\|approved\|rejected\|all`, `POST /admin/reviews/:id/approve\|reject` `{ note? }`, `DELETE /admin/reviews/:id` | |
| Price reports | `GET /admin/price-reports?status=…`, `POST /admin/price-reports/:id/approve` `{ note?, price? }`, `POST /admin/price-reports/:id/reject` `{ note? }` | Approving updates (or creates) the lab price with `source = user_report`, writes history and marks the price verified. Returns 409 if the report was already handled |
| Audit log | `GET /admin/audit-logs`, `GET /admin/audit-logs/facets` | Filters: `entity`, `action`, `adminId`, `entityId`, `from`, `to` |
