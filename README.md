# DamJachai API (দাম যাচাই)

The backend for **DamJachai** ("Check the price"): compare the price and quality signals of diagnostic tests
(blood tests, X-ray, ultrasound, MRI, CT and more) across diagnostic labs in Bangladeshi cities.

The React frontend lives in a separate repository: **[DamJachai-client](https://github.com/Shams-Sajid-Rahman/DamJachai-client)**.

> DamJachai does not give medical advice. Prices can change, so always confirm with the lab.
> All seed data in this repository is **fake sample data** ("Sample Lab 1" and so on). Nothing is scraped.

## What the API does

- **Search** tests in Bangla or English, or by an alias such as "CBC", "HbA1c" or "ডেঙ্গু NS1". English searches tolerate typos (`pg_trgm`).
- **Compare** every lab that offers a test, with filters (city, area, home collection, accreditation, minimum rating),
  sorting (price, rating, report time) and price history.
- **Basket**: total price of several tests at each lab, cheapest first, plus the labs that miss a test.
- **Contributions**: logged-in users report prices and write reviews, which wait for an admin. Users can save favorite labs.
- **Admin**: dashboard stats, create/edit/delete for labs, tests (with aliases), categories, cities, areas and prices,
  CSV import with preview, moderation queues, user management, and an audit log of every admin write.
- **Auth**: JWT access token (15 minutes) + rotating refresh token (7 days, httpOnly cookie, stored hashed).

## Tech stack

| Part | Tools |
|------|-------|
| Runtime | Node.js 20, Express 5 |
| Validation and security | zod 4, helmet, cors, express-rate-limit, bcrypt, jsonwebtoken |
| Other | morgan, dotenv, multer, csv-parse, cookie-parser |
| Database | PostgreSQL 14+ with `pg` and plain numbered SQL migrations (`pg_trgm`, `citext`) |
| Tests | Jest + Supertest |

## Project structure

```
DamJachai-server/
├── src/
│   ├── config/            env (validated with zod), pg pool
│   ├── controllers/ routes/ services/ validators/ middleware/ utils/
│   ├── services/admin/    admin CRUD, import, moderation, dashboard, audit helper
│   ├── db/                migrations/ (001–012 .sql), seeds/, migrate.js, create.js, reset.js
│   └── server.js          entry point
├── tests/                 Jest + Supertest
└── docs/                  API.md, sample-queries.sql
```

## Requirements

- Node.js **20+** and npm 10+
- PostgreSQL **14+**, with the `pg_trgm` and `citext` extensions (both ship with PostgreSQL)

## Setup

```bash
npm install

cp .env.example .env    # then fill in DATABASE_URL, the JWT secrets and the ADMIN_* values

npm run db:create       # creates the database named in DATABASE_URL
npm run migrate         # applies src/db/migrations/*.sql
npm run seed            # EMPTIES all tables, then loads fake sample data and the admin user

npm run dev             # API on http://localhost:5000
```

On Windows (Command Prompt), use `copy .env.example .env` instead of `cp`.

Then start the [frontend](https://github.com/Shams-Sajid-Rahman/DamJachai-client) and log in with `ADMIN_EMAIL` and
`ADMIN_PASSWORD` from `.env` to open `/admin`.

Generate a JWT secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Starts the API with `node --watch` |
| `npm start` | Starts the API without the file watcher |
| `npm run db:create` | Creates the database if it does not exist |
| `npm run migrate` | Applies new migrations (each in its own transaction, recorded with a checksum) |
| `npm run seed` | **Empties every table**, then loads the sample data (refuses to run when `NODE_ENV=production`) |
| `npm run db:reset` | Development only: drop everything, migrate, seed |
| `npm test` | Runs the API tests |

### Environment variables (`.env`)

| Name | Example | Notes |
|------|---------|-------|
| `NODE_ENV` | `development` | `production` hides error details and requires the JWT secrets |
| `PORT` | `5000` | |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/damjachai` | |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 96 hex characters | at least 32 characters each |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | |
| `COOKIE_SAMESITE` | `lax` | use `none` (with HTTPS) if the client and API are on different sites |
| `CLIENT_URL` | `http://localhost:5173` | the only origin CORS allows; set it to the deployed frontend URL in production |
| `TRUST_PROXY` | `0` | set to `1` behind Nginx, a load balancer or a hosting proxy |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | | the first admin, created by `npm run seed` |
| `TEST_DATABASE_URL` | optional | the tests otherwise use `<your database>_test` |

## Database

| Table | Purpose |
|-------|---------|
| `users`, `refresh_tokens` | Accounts (`user` or `admin`). Refresh tokens are stored only as SHA-256 hashes, with rotation tracking |
| `cities`, `areas` | Locations in Bangla and English, with URL slugs |
| `labs` | Address, map position, hours, accreditation, home collection, `is_sample`, `status` (active or hidden) |
| `test_categories`, `tests`, `test_aliases` | Test catalog. Aliases power search. `search_count` ranks popular tests |
| `lab_tests` | The price of a test at a lab (unique per pair), with discount, report hours, `last_verified_at` and `source` |
| `price_history` | Old and new price, who changed it, and when |
| `reviews`, `price_reports` | User content: `pending`, `approved` or `rejected`, plus the reviewer and a note |
| `favorites` | Labs a user has saved |
| `audit_logs` | Every admin write (action, entity, id, JSON details) |

Data rules:
- Prices must be above 0, a discount can't exceed the price, and ratings run from 1 to 5.
- Slugs are checked for format.
- Labs and tests that have prices can't be hard deleted (`RESTRICT`). The admin API hides them instead.

Example queries: [docs/sample-queries.sql](docs/sample-queries.sql).

## API

See **[docs/API.md](docs/API.md)** for every endpoint, parameter and rule.

## Testing

```bash
npm test
```

**41 Jest + Supertest tests** (`tests/`). They cover:
- registration, login, `/me`, refresh rotation, replay detection (revokes every session), logout and deactivated accounts
- search (alias, Bangla, typos, LIKE wildcards), compare (sorting, stats, combined filters, live DB changes), price history
- the basket (totals, ordering, partial labs, validation)
- approving a price report (price change, history, audit log, no double approval), rejecting one, and moderating a review
- admin permissions (401 for guests and 403 for users on admin routes), create/edit/delete with the audit log, hiding a
  lab that has prices, price history on change, aliases, self-protection, and CSV import (preview, confirm, file type and size)

The tests run against a separate database, `<your database>_test`. It is created, migrated and seeded on every run,
and its name must end in `_test`. PostgreSQL must be running.

## Security

- Every route validates input with zod, and unknown fields are dropped.
- Every query is parameterized. Dynamic `WHERE` and `ORDER BY` clauses are built only from constant fragments and
  whitelists (`SqlParams` in `src/utils/sql.js`).
- bcrypt (12 rounds) for passwords. Login uses the same timing and error for unknown emails, so accounts can't be discovered.
- JWT algorithm pinned to HS256 with an issuer check. Refresh tokens are httpOnly, `SameSite`, `Secure` in production,
  scoped to `/api/auth`, hashed in the database and rotated on use. A replayed old token revokes every session of that user.
- Rate limits:
  - login: 10 per 15 minutes
  - register: 10 per hour
  - reports and reviews: 30 per hour
  - whole API: 1,000 per 15 minutes
- helmet. CORS only for `CLIENT_URL`. JSON bodies capped at 100 kB. `trust proxy` is off unless configured.
- CSV upload: kept in memory, `.csv` only, 1 MB and 2,000 rows at most.
- Admin routes need `requireAuth` and `requireRole('admin')`. Admins cannot demote or deactivate themselves, and the
  last admin can't be removed.
- No secrets in the repo: `.env` is git-ignored.

## Performance

EXPLAIN ANALYZE on a throwaway database with 3,000 labs, about 120,000 prices and 18,000 reviews:
- The compare query (city and home-collection filters, rating per lab) runs in **13 ms** using
  `lab_tests_test_id_price_idx` and `reviews_lab_status_idx`.
- The basket query runs in **10 ms**.

## Known issues and limits

1. **Sample data only.** No real labs or prices yet. Real data must be entered by admins or imported by CSV.
2. **Bangla search** uses substring matching, because `pg_trgm` cannot split Bengali text into useful trigrams.
   English searches tolerate typos; Bangla searches need a correct part of the name.
3. **Rate limits are kept in memory**, per server process. Several API instances would need a shared store such as Redis.
4. **No password reset or email verification** yet.
5. **The CSV import has no undo button.** Every change it makes is in `price_history` and the audit log, so it can be
   reverted by hand.
6. **Dev-only advisory:** `npm audit` reports 6 low-severity issues in `deepmerge`, which jest-config depends on. It is
   used only to run the tests, never at runtime.
