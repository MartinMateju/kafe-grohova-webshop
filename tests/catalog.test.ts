import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseDates } from '../data/demo-dates.mjs';
import { mockCourses, mockMerch, mockArticles } from '../src/lib/shopify/mock';

const root = fileURLToPath(new URL('../', import.meta.url));
let scratch: string;
let csv: string;
let rows: Record<string, string>[];

function generate(timezone: string) {
  execFileSync(process.execPath, [
    'scripts/generate-demo-catalog.mjs', '--date', '2026-10-09', '--out', scratch,
  ], { cwd: root, env: { ...process.env, TZ: timezone }, stdio: 'pipe' });
}

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'grohova-catalog-test-'));
  generate('Pacific/Honolulu');
  csv = await readFile(join(scratch, 'products.csv'), 'utf8');
  // The exporter quotes every field; this fixture has no multiline fields.
  const [headers, ...records] = csv.trimEnd().split('\n').map(line =>
    [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')),
  );
  assert(headers);
  rows = records.map(record => {
    assert.equal(record.length, headers.length, 'CSV rows must match the header width');
    return Object.fromEntries(headers.map((header, index) => [header, record[index]!])) as Record<string, string>;
  });
});

after(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('CSV is valid UTF-8 with unique SKUs and unpublished draft products', () => {
  assert.equal(rows.length, 22);
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
  assert.equal(courseRows.length, 9);
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
