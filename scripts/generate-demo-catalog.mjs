import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { courseDates, courseDateLabel, demoBaseDate, DEMO_TIMEZONE } from '../data/demo-dates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  date: { type: 'string', default: demoBaseDate() },
  lang: { type: 'string', default: 'cs' },
  'image-base': { type: 'string' },
  out: { type: 'string', default: 'data/shopify' },
  help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('node scripts/generate-demo-catalog.mjs [--date YYYY-MM-DD] [--lang cs|en] [--image-base https://your-public-site.example] [--out data/shopify]');
  process.exit(0);
}
assert(['cs', 'en'].includes(values.lang), '--lang must be cs or en');
courseDates(values.date, 0, 10, 60); // Validate before writing anything.
const imageBase = values['image-base'] ? new URL(values['image-base']) : null;
if (imageBase) {
  assert(imageBase.protocol === 'https:', '--image-base must use HTTPS');
  assert(!imageBase.username && !imageBase.password, '--image-base must not contain credentials');
  assert(!['localhost', '127.0.0.1', '[::1]'].includes(imageBase.hostname), 'Shopify needs publicly accessible image URLs');
}
const catalog = JSON.parse(await readFile(join(root, 'data/demo-catalog.json'), 'utf8'));
const seenHandles = new Set();
const seenSkus = new Set();
for (const product of catalog.products) {
  assert(!seenHandles.has(product.handle), `Duplicate handle: ${product.handle}`);
  seenHandles.add(product.handle);
  assert(/^[a-z0-9-]+$/.test(product.handle), `Invalid handle: ${product.handle}`);
  assert(product.variants.length > 0, `No variants: ${product.handle}`);
  for (const image of product.images) await access(join(root, 'public', image.url));
  for (const variant of product.variants) {
    assert(!seenSkus.has(variant.sku), `Duplicate SKU: ${variant.sku}`);
    seenSkus.add(variant.sku);
    assert(Number.isFinite(variant.price) && variant.price >= 0, `Invalid price: ${variant.sku}`);
    assert(Number.isInteger(variant.quantity) && variant.quantity >= 0, `Invalid inventory: ${variant.sku}`);
    if (product.course) {
      assert(variant.quantity <= product.course.capacity, `Seats exceed capacity: ${variant.sku}`);
      assert(Number.isInteger(variant.offsetDays) && variant.offsetDays > 0, `Invalid date offset: ${variant.sku}`);
      assert(Number.isInteger(variant.localHour) && variant.localHour >= 6 && variant.localHour <= 22, `Invalid daytime session: ${variant.sku}`);
    }
  }
}

const headers = [
  'Title', 'URL handle', 'Description', 'Vendor', 'Type', 'Tags',
  'Published on online store', 'Status', 'Option1 name', 'Option1 value',
  'SKU', 'Price', 'Inventory tracker', 'Inventory quantity',
  'Continue selling when out of stock', 'Requires shipping',
  'Fulfillment service', 'Weight value (grams)', 'Weight unit for display', 'Collection',
  ...(imageBase ? ['Product image URL', 'Image position', 'Image alt text'] : []),
];
const rows = [];
const courses = [];
const imageManifest = [];
const lang = values.lang;
const products = catalog.products.filter(product => product.productType !== 'Gift Card');
for (const product of products) {
  const options = new Set();
  const sessions = [];
  product.variants.forEach((variant, index) => {
    const dates = product.course
      ? courseDates(values.date, variant.offsetDays, variant.localHour, product.course.durationMinutes)
      : null;
    const option = dates ? courseDateLabel(dates.startsAt, lang) : variant.value[lang];
    assert(!options.has(option), `Duplicate option in ${product.handle}: ${option}`);
    options.add(option);
    const image = product.images[index];
    rows.push({
      Title: index === 0 ? `[DEMO] ${product.title[lang]}` : '',
      'URL handle': product.handle,
      Description: index === 0 ? product.descriptionHtml[lang] : '',
      Vendor: index === 0 ? 'Demo catalog' : '',
      Type: index === 0 ? product.productType : '',
      Tags: index === 0 ? product.tags.join(', ') : '',
      'Published on online store': 'false', Status: 'draft',
      'Option1 name': product.optionName[lang], 'Option1 value': option,
      SKU: variant.sku, Price: variant.price.toFixed(2),
      'Inventory tracker': 'shopify', 'Inventory quantity': variant.quantity,
      'Continue selling when out of stock': 'deny',
      'Requires shipping': String(product.requiresShipping),
      'Fulfillment service': 'manual',
      'Weight value (grams)': product.weightGrams, 'Weight unit for display': 'g',
      Collection: index === 0 ? (product.course ? 'barista-kurzy' : 'merch') : '',
      ...(imageBase && image ? {
        'Product image URL': new URL(image.url, imageBase).href,
        'Image position': index + 1, 'Image alt text': image.altText,
      } : {}),
    });
    if (dates) sessions.push({
      sku: variant.sku, optionValue: option, inventory: variant.quantity,
      metafields: [
        { namespace: 'course', key: 'starts_at', type: 'date_time', value: dates.startsAt },
        { namespace: 'course', key: 'ends_at', type: 'date_time', value: dates.endsAt },
      ],
    });
  });
  if (imageBase) product.images.slice(product.variants.length).forEach((image, index) => rows.push({
    'URL handle': product.handle, 'Product image URL': new URL(image.url, imageBase).href,
    'Image position': product.variants.length + index + 1, 'Image alt text': image.altText,
  }));
  imageManifest.push({ handle: product.handle, images: product.images.map(image => ({ path: `public${image.url}`, altText: image.altText })) });
  if (product.course) courses.push({
    handle: product.handle,
    metafields: [
      { namespace: 'course', key: 'duration_minutes', type: 'number_integer', value: String(product.course.durationMinutes) },
      { namespace: 'course', key: 'capacity', type: 'number_integer', value: String(product.course.capacity) },
      { namespace: 'course', key: 'level', type: 'single_line_text_field', value: product.course.level[lang] },
      { namespace: 'course', key: 'syllabus', type: 'list.single_line_text_field', value: JSON.stringify(product.course.syllabus[lang]) },
    ],
    variants: sessions,
  });
}
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))]
  .map(row => row.map(cell).join(',')).join('\n') + '\n';
const output = resolve(root, values.out);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'products.csv'), csv, 'utf8');
await writeFile(join(output, 'course-metafields.json'), JSON.stringify({
  note: 'Reference values for Shopify admin. Not a Shopify JSON import file. Match variants by SKU after CSV import.',
  baseDate: values.date, timezone: DEMO_TIMEZONE, language: lang, currency: catalog.currency, courses,
}, null, 2) + '\n');
await writeFile(join(output, 'images.json'), JSON.stringify(imageManifest, null, 2) + '\n');
console.log(`Generated ${products.length} draft products, ${products.reduce((sum, product) => sum + product.variants.length, 0)} variants, and ${courses.length} course metadata records in ${output}`);
console.log(`Base date: ${values.date}; language: ${lang}; currency: ${catalog.currency}. Gift cards require native Shopify setup.`);
console.log(imageBase ? 'Verify the supplied image URLs are public before import.' : 'Images omitted from CSV; upload the files listed in images.json after import.');
