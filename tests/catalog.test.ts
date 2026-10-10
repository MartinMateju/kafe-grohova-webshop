import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { courseDates } from '../data/demo-dates.mjs';
import { mockCourses, mockMerch, mockArticles } from '../src/lib/shopify/mock';

const root = fileURLToPath(new URL('../', import.meta.url));
let scratch: string;
let csv: string;
let rows: Record<string, string>[];

function generate(timezone: string, output = scratch, coursesOnly = false) {
  execFileSync(process.execPath, [
    'scripts/generate-demo-catalog.mjs', '--date', '2026-10-09', '--out', output,
    ...(coursesOnly ? ['--courses-only'] : []),
  ], { cwd: root, env: { ...process.env, TZ: timezone }, stdio: 'pipe' });
}

function parseCSV(contents: string): Record<string, string>[] {
  // The exporter quotes every field; this fixture has no multiline fields.
  const [headers, ...records] = contents.trimEnd().split('\n').map(line =>
    [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')),
  );
  assert(headers);
  return records.map(record => {
    assert.equal(record.length, headers.length, 'CSV rows must match the header width');
    return Object.fromEntries(headers.map((header, index) => [header, record[index]!])) as Record<string, string>;
  });
}

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'grohova-catalog-test-'));
  generate('Pacific/Honolulu');
  csv = await readFile(join(scratch, 'products.csv'), 'utf8');
  rows = parseCSV(csv);
});

after(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('CSV is valid UTF-8 with unique SKUs and unpublished draft products', () => {
  assert.equal(rows.length, 21);
  assert.equal(new Set(rows.map(row => row['URL handle'])).size, 10);
  assert.equal(new Set(rows.map(row => row.SKU)).size, rows.length);
  assert(rows.every(row => row.SKU.startsWith('DEMO-')));
  assert(rows.every(row => row.Status === 'draft' && row['Published on online store'] === 'false'));
  assert(rows.every(row => row['Option1 name'] && row['Option1 value']));
  assert(rows.every(row => /^\d+\.\d{2}$/.test(row.Price)));
  assert(csv.includes('Ukázkový'));
  assert(!csv.includes('\r'), 'Shopify CSV should use LF line endings');
  assert(!csv.includes('Product image URL'), 'Default export must not send relative image URLs to Shopify');
  assert(!rows.some(row => row['URL handle'] === 'darkovy-poukaz'), 'Shopify CSV cannot create native gift cards');
});

test('course inventory represents seats and shipping is disabled', () => {
  const courses = mockCourses('cs');
  const courseRows = rows.filter(row => courses.some(course => course.handle === row['URL handle']));
  assert.equal(courseRows.length, 8);
  assert(courseRows.every(row => row['Requires shipping'] === 'false'));
  assert(courseRows.every(row => row['Inventory tracker'] === 'shopify'));
  assert(courseRows.every(row => row['Continue selling when out of stock'] === 'deny'));
  assert(courseRows.some(row => row['Inventory quantity'] === '0'), 'Keep a sold-out session for UI coverage');
  for (const row of courseRows) {
    const course = courses.find(item => item.handle === row['URL handle'])!;
    const seats = Number(row['Inventory quantity']);
    assert(Number.isInteger(seats) && seats >= 0 && seats <= course.course!.capacity!);
  }
  assert(rows.filter(row => !courseRows.includes(row)).every(row => row['Requires shipping'] === 'true'));
});

test('beginner latte art, cupping and filter courses respect the requested 2/4/4 participant limits', () => {
  const courses = mockCourses('cs');
  const latte = courses.find(course => course.handle === 'latte-art')!;
  const cupping = courses.find(course => course.handle === 'cupping')!;
  const filter = courses.find(course => course.handle === 'filtrovana-kava')!;
  assert.equal(latte.title, 'LATTE ART PRO ZAČÁTEČNÍKY');
  assert.equal(latte.course?.level, 'Začátečník');
  assert.equal(latte.course?.capacity, 2);
  assert(latte.tags.includes('beginner') && !latte.tags.includes('intermediate'));
  assert(latte.variants.every(variant => variant.quantityAvailable !== null && variant.quantityAvailable <= 2));
  assert.equal(cupping.course?.capacity, 4);
  assert(cupping.variants.every(variant => variant.quantityAvailable !== null && variant.quantityAvailable <= 4));
  assert(cupping.descriptionHtml.includes('demonstrační'));
  assert.equal(filter.title, 'PŘÍPRAVA FILTROVANÉ KÁVY');
  assert.equal(filter.course?.capacity, 4);
  assert(filter.variants.every(variant => variant.quantityAvailable !== null && variant.quantityAvailable <= 4));
  assert.deepEqual(courses.map(course => course.handle), ['latte-art', 'cupping', 'filtrovana-kava']);
});

test('courses-only export excludes merchandise from every output while preserving its fixtures', async () => {
  const sourceBefore = await readFile(join(root, 'data/demo-catalog.json'), 'utf8');
  const output = join(scratch, 'courses-only');
  generate('Europe/Prague', output, true);
  const courseRows = parseCSV(await readFile(join(output, 'products.csv'), 'utf8'));
  const courseHandles = mockCourses('cs').map(course => course.handle).sort();
  assert.equal(courseHandles.length, 3);
  assert.equal(courseRows.length, 8);
  assert(!courseRows.some(row => row['URL handle'] === 'espresso-zaklady'));
  assert.deepEqual([...new Set(courseRows.map(row => row['URL handle']))].sort(), courseHandles);
  assert(courseRows.every(row => row['Requires shipping'] === 'false'));
  assert(courseRows.every(row => row.Status === 'draft' && row['Published on online store'] === 'false'));
  assert(courseRows.filter(row => row.Title).every(row => row.Type === 'Course' && row.Collection === 'barista-kurzy'));
  const metadata = JSON.parse(await readFile(join(output, 'course-metafields.json'), 'utf8'));
  const images = JSON.parse(await readFile(join(output, 'images.json'), 'utf8'));
  assert.deepEqual(metadata.courses.map((course: { handle: string }) => course.handle).sort(), courseHandles);
  assert.deepEqual(images.map((product: { handle: string }) => product.handle).sort(), courseHandles);
  assert.equal(await readFile(join(root, 'data/demo-catalog.json'), 'utf8'), sourceBefore);
  assert(mockMerch('cs').length > 0, 'Merchandise fixtures remain available for a later launch');
});

test('a pinned export date is byte-identical across build host timezones', async () => {
  const metadata = await readFile(join(scratch, 'course-metafields.json'), 'utf8');
  generate('Asia/Tokyo');
  assert.equal(await readFile(join(scratch, 'products.csv'), 'utf8'), csv);
  assert.equal(await readFile(join(scratch, 'course-metafields.json'), 'utf8'), metadata);
});

test('Prague course times survive spring and autumn daylight saving changes', () => {
  const spring = courseDates('2026-03-27', 2, 10, 240);
  const autumn = courseDates('2026-10-23', 2, 10, 240);
  assert.equal(spring.startsAt, '2026-03-29T08:00:00.000Z');
  assert.equal(autumn.startsAt, '2026-10-25T09:00:00.000Z');
  assert.equal(Date.parse(spring.endsAt) - Date.parse(spring.startsAt), 4 * 3_600_000);
  assert.throws(() => courseDates('2026-02-30', 0, 10, 60), /valid YYYY-MM-DD/);
});

test('demo gift-card prices and localized fixture identities stay consistent', () => {
  for (const lang of ['cs', 'en'] as const) {
    const merch = mockMerch(lang);
    const gift = merch.find(product => product.handle === 'darkovy-poukaz')!;
    assert.deepEqual(gift.variants.map(variant => Number(variant.price.amount)), [1000, 2000, 3000]);
    assert.equal(gift.priceRange.minVariantPrice.amount, '1000.00');
    assert.equal(gift.priceRange.maxVariantPrice.amount, '3000.00');
    for (const product of [...merch, ...mockCourses(lang)]) {
      assert.deepEqual(product.options[0]!.values, product.variants.map(variant => variant.title));
      assert.equal(product.availableForSale, product.variants.some(variant => variant.availableForSale));
    }
  }
  assert.deepEqual(mockArticles('cs').map(article => article.id), mockArticles('en').map(article => article.id));
});

// Run the real CLI with synthetic responses from an environment-free directory.
// This never reads repository env files, contacts Shopify, or creates a real cart.
function verifyCourses(options: { capacity: number | null; quantity: number; cart?: boolean }) {
  const script = `
    import assert from 'node:assert/strict';
    const options = ${JSON.stringify(options)};
    if (options.cart) process.argv.push('--cart');
    const connection = nodes => ({ nodes, pageInfo: { hasNextPage: false } });
    const price = { amount: '900.00', currencyCode: 'CZK' };
    const future = { id: 'future', title: 'Future', availableForSale: true,
      quantityAvailable: options.quantity, price,
      startsAt: { value: '2099-10-20T10:00:00+02:00' } };
    const past = { ...future, id: 'past', startsAt: { value: '2020-10-20T10:00:00+02:00' } };
    globalThis.fetch = async (_url, request) => {
      const { query, variables } = JSON.parse(request.body);
      if (query.includes('query VerifyShop')) return Response.json({ data: { shop: {
        name: 'Test', primaryDomain: { host: 'test.myshopify.com' }, paymentSettings: { currencyCode: 'CZK' }
      } } });
      if (query.includes('query CollectionByHandle')) {
        assert.equal(variables.handle, 'barista-kurzy', 'Hidden merchandise must not be fetched');
        return Response.json({ data: { collection: { products: connection([{
          id: 'course', handle: 'latte-art', title: 'Latte art', productType: 'Course', tags: ['course'],
          courseCapacity: options.capacity === null ? null : { value: String(options.capacity) },
          variants: connection(options.cart ? [past, future] : [future]),
          priceRange: { minVariantPrice: price, maxVariantPrice: price }
        }]) } } });
      }
      if (query.includes('query Articles')) return Response.json({ data: { blog: { articles: connection([]) } } });
      if (query.includes('mutation CartCreate') && options.cart) {
        assert.equal(variables.lines[0].merchandiseId, 'future', 'A past course must never be probed');
        return Response.json({ data: { cartCreate: { userErrors: [], warnings: [], cart: {
          id: 'test-cart', checkoutUrl: 'https://checkout.example.test/', lines: connection([{ id: 'test-line' }])
        } } } });
      }
      if (query.includes('mutation CartLinesRemove') && options.cart) {
        assert.deepEqual(variables.lineIds, ['test-line']);
        return Response.json({ data: { cartLinesRemove: { userErrors: [], cart: { totalQuantity: 0 } } } });
      }
      throw new Error('Unexpected request in synthetic verification');
    };
    await import(${JSON.stringify(pathToFileURL(join(root, 'scripts/verify-shopify.ts')).href)});
  `;
  return spawnSync(process.execPath, [
    '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href,
    '--input-type=module', '--eval', script,
  ], {
    cwd: scratch, encoding: 'utf8',
    env: {
      ...process.env, PUBLIC_SHOPIFY_MODE: 'live', PUBLIC_MERCH_ENABLED: 'false',
      PUBLIC_SHOPIFY_STORE_DOMAIN: 'test.myshopify.com', PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'public-test-token',
      PUBLIC_SHOPIFY_API_VERSION: '2026-07', PUBLIC_SHOPIFY_COURSES_COLLECTION: 'barista-kurzy', PUBLIC_SHOPIFY_BLOG_HANDLE: 'news',
    },
  });
}

test('live verifier accepts courses without merchandise and rejects missing or excessive capacities', () => {
  const valid = verifyCourses({ capacity: 2, quantity: 2 });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Read-only verification passed/);
  for (const [options, message] of [
    [{ capacity: null, quantity: 2 }, /positive integer course.capacity/],
    [{ capacity: 0, quantity: 0 }, /positive integer course.capacity/],
    [{ capacity: 4, quantity: 2 }, /must have capacity 2/],
    [{ capacity: 2, quantity: 3 }, /seat inventory/],
  ] as const) {
    const invalid = verifyCourses(options);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, message);
  }
});

test('course-only cart verification selects a future session with stock and empties its synthetic cart', () => {
  const result = verifyCourses({ capacity: 2, quantity: 2, cart: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Test cart emptied/);
});
