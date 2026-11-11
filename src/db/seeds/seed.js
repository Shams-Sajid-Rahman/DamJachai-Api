// Fills the database with clearly FAKE sample data. Run with `npm run seed`.
// WARNING: this first empties every data table, including users. It refuses to run when NODE_ENV=production.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { withTransaction, closePool } from '../../config/db.js';
import { createRandom, clamp, roundTaka, daysAgo, shuffle } from './random.js';
import { cities } from './data/locations.js';
import { categories } from './data/categories.js';
import { tests } from './data/tests.js';
import { labs } from './data/labs.js';
import { sampleUsers, reviewComments, priceReportNotes } from './data/community.js';

const TIERS_BY_CAPABILITY = {
  basic: ['basic'],
  mid: ['basic', 'mid'],
  full: ['basic', 'mid', 'full'],
};

async function clearTables(client) {
  await client.query(`
    TRUNCATE audit_logs, favorites, price_reports, reviews, price_history, lab_tests,
             test_aliases, tests, test_categories, labs, areas, cities, refresh_tokens, users
    RESTART IDENTITY CASCADE`);
}

async function seedUsers(client) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env before seeding.');
  }

  const adminHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const { rows: [admin] } = await client.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
    [env.ADMIN_NAME, env.ADMIN_EMAIL, adminHash],
  );

  // Sample users get a random password nobody knows, so nobody can log in as them.
  const userIds = [];
  for (const user of sampleUsers) {
    const hash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const { rows: [row] } = await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING id`,
      [user.name, user.email, hash],
    );
    userIds.push(row.id);
  }

  return { adminId: admin.id, userIds };
}

async function seedLocations(client) {
  const cityIds = {};
  const areas = {}; // "city/area" -> { id, lat, lng }

  for (const city of cities) {
    const { rows: [c] } = await client.query(
      'INSERT INTO cities (name_en, name_bn, slug) VALUES ($1, $2, $3) RETURNING id',
      [city.name_en, city.name_bn, city.slug],
    );
    cityIds[city.slug] = c.id;

    for (const area of city.areas) {
      const { rows: [a] } = await client.query(
        'INSERT INTO areas (city_id, name_en, name_bn, slug) VALUES ($1, $2, $3, $4) RETURNING id',
        [c.id, area.name_en, area.name_bn, area.slug],
      );
      areas[`${city.slug}/${area.slug}`] = { id: a.id, lat: area.lat, lng: area.lng, name: area.name_en, city: city.name_en };
    }
  }

  return { cityIds, areas };
}

async function seedCatalog(client) {
  const categoryIds = {};
  for (const cat of categories) {
    const { rows: [row] } = await client.query(
      'INSERT INTO test_categories (name_en, name_bn, slug) VALUES ($1, $2, $3) RETURNING id',
      [cat.name_en, cat.name_bn, cat.slug],
    );
    categoryIds[cat.slug] = row.id;
  }

  const testRows = [];
  let aliasCount = 0;
  for (const test of tests) {
    const { rows: [row] } = await client.query(
      `INSERT INTO tests (category_id, name_en, name_bn, slug, description, sample_type, preparation_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        categoryIds[test.category],
        test.name_en,
        test.name_bn,
        test.slug,
        test.description ?? null,
        test.sample_type ?? null,
        test.preparation_note ?? null,
      ],
    );
    testRows.push({ ...test, id: row.id });

    for (const alias of new Set(test.aliases)) {
      await client.query('INSERT INTO test_aliases (test_id, alias) VALUES ($1, $2)', [row.id, alias]);
      aliasCount += 1;
    }
  }

  return { testRows, aliasCount, categoryCount: categories.length };
}

async function seedLabs(client, { cityIds, areas }, rand) {
  const labRows = [];
  for (const lab of labs) {
    const area = areas[`${lab.city}/${lab.area}`];
    const name = `Sample Lab ${lab.n}`;
    const { rows: [row] } = await client.query(
      `INSERT INTO labs (name, slug, city_id, area_id, address, phone, website, latitude, longitude,
                         opening_hours, is_accredited, accreditation_note, home_collection,
                         home_collection_fee, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
       RETURNING id`,
      [
        name,
        `sample-lab-${lab.n}`,
        cityIds[lab.city],
        area.id,
        `House ${lab.n}, Road ${lab.n + 2} (sample address), ${area.name}, ${area.city}`,
        `+880 1000-0000${String(lab.n).padStart(2, '0')}`,
        `https://example.com/sample-lab-${lab.n}`,
        (area.lat + rand.between(-0.008, 0.008)).toFixed(6),
        (area.lng + rand.between(-0.008, 0.008)).toFixed(6),
        lab.hours,
        lab.accredited,
        lab.accredited ? 'Sample data: accreditation shown for demo purposes only.' : null,
        lab.home,
        lab.home ? lab.fee : null,
      ],
    );
    labRows.push({ ...lab, id: row.id, name });
  }
  return labRows;
}

/** Builds a backwards chain of earlier prices that ends at the current price. */
function buildPriceChain(currentPrice, changes, rand) {
  const chain = [currentPrice];
  for (let i = 0; i < changes; i += 1) {
    let previous = roundTaka(chain[0] * rand.between(0.85, 1.05));
    if (previous === chain[0]) previous = roundTaka(chain[0] * 0.9);
    chain.unshift(previous);
  }
  return chain;
}

async function seedPrices(client, labRows, testRows, adminId, rand) {
  const now = Date.now();
  let priceCount = 0;
  let historyCount = 0;

  for (const lab of labRows) {
    const allowedTiers = TIERS_BY_CAPABILITY[lab.capability];

    for (const test of testRows) {
      if (!allowedTiers.includes(test.tier)) continue;
      if (rand.chance(0.08)) continue; // a few gaps, so not every lab offers every test

      const [min, max] = test.range;
      const position = clamp(lab.priceLevel + rand.between(-0.15, 0.15), 0, 1);
      const price = roundTaka(min + (max - min) * position);
      const discounted = rand.chance(0.2) ? roundTaka(price * rand.between(0.8, 0.92)) : null;
      const reportHours = Math.max(1, Math.round(test.hours * lab.speed * rand.between(0.9, 1.1)));

      // Most prices were verified recently. Some are old (over 90 days), to test "stale price" warnings.
      const verifiedDaysAgo = Math.round(rand.next() ** 2 * 150);
      const createdDaysAgo = verifiedDaysAgo + rand.int(60, 300);
      const lastVerifiedAt = daysAgo(verifiedDaysAgo, now);
      const createdAt = daysAgo(createdDaysAgo, now);

      const { rows: [row] } = await client.query(
        `INSERT INTO lab_tests (lab_id, test_id, price, discounted_price, report_hours,
                                last_verified_at, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'import', $7, $6)
         RETURNING id`,
        [lab.id, test.id, price, discounted && discounted < price ? discounted : null, reportHours, lastVerifiedAt, createdAt],
      );
      priceCount += 1;

      // Price history: the first price, then 0 to 3 later changes ending at the current price.
      const roll = rand.next();
      const changes = roll < 0.6 ? 0 : roll < 0.85 ? 1 : rand.int(2, 3);
      const chain = buildPriceChain(price, changes, rand);
      const step = (createdDaysAgo - verifiedDaysAgo) / Math.max(1, changes);

      for (let i = 0; i < chain.length; i += 1) {
        const changedAt = i === 0 ? createdAt : daysAgo(createdDaysAgo - step * i, now);
        await client.query(
          `INSERT INTO price_history (lab_test_id, old_price, new_price, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, i === 0 ? null : chain[i - 1], chain[i], adminId, changedAt],
        );
        historyCount += 1;
      }
    }
  }

  return { priceCount, historyCount };
}

async function seedCommunity(client, labRows, testRows, userIds, adminId, rand) {
  let approved = 0;
  let pending = 0;
  const used = new Set(); // "userId/labId" pairs that already have a review (one review per user per lab)

  // 1 to 3 approved reviews per lab, each from a different sample user.
  for (const lab of labRows) {
    const reviewers = shuffle(userIds, rand).slice(0, rand.int(1, 3));
    for (const userId of reviewers) {
      used.add(`${userId}/${lab.id}`);
      const r = rand.pick(reviewComments);
      const createdAt = daysAgo(rand.int(5, 120));
      await client.query(
        `INSERT INTO reviews (user_id, lab_id, rating, report_on_time, comment, status,
                              reviewed_by, reviewed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $7, $7)`,
        [userId, lab.id, r.rating, r.onTime, r.comment, adminId, createdAt],
      );
      approved += 1;
    }
  }

  // A few pending reviews for the admin queue, using user and lab pairs that have no review yet.
  const freePairs = shuffle(
    userIds.flatMap((userId) => labRows.map((lab) => [userId, lab.id])).filter(([u, l]) => !used.has(`${u}/${l}`)),
    rand,
  );
  for (const [userId, labId] of freePairs.slice(0, 4)) {
    const r = rand.pick(reviewComments);
    await client.query(
      `INSERT INTO reviews (user_id, lab_id, rating, report_on_time, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, labId, r.rating, r.onTime, r.comment],
    );
    pending += 1;
  }

  // Pending price reports for the admin queue.
  let reports = 0;
  for (let i = 0; i < 3; i += 1) {
    const test = rand.pick(testRows.filter((t) => t.tier === 'basic'));
    await client.query(
      `INSERT INTO price_reports (user_id, lab_id, test_id, reported_price, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [rand.pick(userIds), rand.pick(labRows).id, test.id, roundTaka(rand.between(...test.range)), priceReportNotes[i]],
    );
    reports += 1;
  }

  return { approved, pending, reports };
}

export async function runSeed() {
  if (env.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed: NODE_ENV=production. The seed deletes all data.');
  }

  const rand = createRandom();

  const summary = await withTransaction(async (client) => {
    await clearTables(client);
    const { adminId, userIds } = await seedUsers(client);
    const locations = await seedLocations(client);
    const { testRows, aliasCount, categoryCount } = await seedCatalog(client);
    const labRows = await seedLabs(client, locations, rand);
    const prices = await seedPrices(client, labRows, testRows, adminId, rand);
    const community = await seedCommunity(client, labRows, testRows, userIds, adminId, rand);

    return {
      cities: cities.length,
      areas: Object.keys(locations.areas).length,
      categories: categoryCount,
      tests: testRows.length,
      aliases: aliasCount,
      labs: labRows.length,
      'lab prices': prices.priceCount,
      'price history rows': prices.historyCount,
      users: `1 admin + ${userIds.length} sample users`,
      'approved reviews': community.approved,
      'pending reviews': community.pending,
      'pending price reports': community.reports,
    };
  });

  console.log('✓ Seed complete (all labs, prices and reviews are FAKE sample data):');
  console.table(summary);
  console.log(`Admin login: ${env.ADMIN_EMAIL} (password from ADMIN_PASSWORD in server/.env)`);
}

// Run directly: `npm run seed`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSeed()
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
