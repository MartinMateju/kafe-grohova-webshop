import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build, createServer } from 'vite';

// Exercise the real TypeScript modules with synthetic API responses, never a shop.
const keys = ['PUBLIC_SHOPIFY_MODE', 'PUBLIC_SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_MERCH_ENABLED'];
const previous = keys.map((key) => process.env[key]);
process.env.PUBLIC_SHOPIFY_MODE = 'live';
process.env.PUBLIC_SHOPIFY_STORE_DOMAIN = 'integration-test.myshopify.com';
process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN = 'public-test-token';
process.env.PUBLIC_MERCH_ENABLED = 'true';
const originalFetch = globalThis.fetch;
const server = await createServer({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  configFile: false,
  envFile: false,
  envPrefix: 'PUBLIC_',
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const config = await server.ssrLoadModule('/src/lib/shopify/config.ts');
const shop = await server.ssrLoadModule('/src/lib/shopify/index.ts');
const { normalizeCart } = await server.ssrLoadModule('/src/lib/shopify/normalize.ts');

// A separate module graph verifies the default hidden state without mutating cached exports.
delete process.env.PUBLIC_MERCH_ENABLED;
const hiddenServer = await createServer({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  configFile: false, envFile: false, envPrefix: 'PUBLIC_',
  server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error',
});
const hiddenShop = await hiddenServer.ssrLoadModule('/src/lib/shopify/index.ts');
process.env.PUBLIC_MERCH_ENABLED = 'true';

process.env.PUBLIC_SHOPIFY_MODE = 'demo';
const demoServer = await createServer({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  configFile: false, envFile: false, envPrefix: 'PUBLIC_',
  server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error',
});
const demoShop = await demoServer.ssrLoadModule('/src/lib/shopify/index.ts');
process.env.PUBLIC_SHOPIFY_MODE = 'live';


after(async () => {
  globalThis.fetch = originalFetch;
  keys.forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]);
  await server.close();
  await hiddenServer.close();
  await demoServer.close();
});

const connection = (nodes, cursor = null) => ({
  nodes, pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor },
});
const variant = (id, overrides = {}) => ({
  id, title: id, availableForSale: true, quantityAvailable: 3,
  price: { amount: '900', currencyCode: 'CZK' }, ...overrides,
});
const product = (handle, variants = connection([variant(`${handle}-date`)])) => ({
  id: handle, handle, title: handle, productType: 'Course', tags: ['course'],
  availableForSale: true, variants,
  priceRange: { minVariantPrice: { amount: '900', currencyCode: 'CZK' } },
});

function fakeAPI(handler) {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/integration-test\.myshopify\.com\/api\//);
    assert.equal(options.headers['X-Shopify-Storefront-Access-Token'], 'public-test-token');
    return Response.json({ data: await handler(JSON.parse(options.body)) });
  };
}

test('demo is intentional and incomplete live credentials fail with actionable errors', () => {
  assert.equal(config.resolveShopifyConfig({}).isMockMode, true);
  assert.equal(config.resolveShopifyConfig({ PUBLIC_SHOPIFY_MODE: 'demo', PUBLIC_SHOPIFY_STORE_DOMAIN: 'shop.myshopify.com' }).isMockMode, true);
  assert.throws(() => config.resolveShopifyConfig({ PUBLIC_SHOPIFY_MODE: 'live' }), /requires both/);
  assert.throws(() => config.resolveShopifyConfig({ PUBLIC_SHOPIFY_STORE_DOMAIN: 'shop.myshopify.com' }), /requires both/);
  const live = {
    PUBLIC_SHOPIFY_STORE_DOMAIN: ' https://Shop.myshopify.com/ ',
    PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'public-token',
  };
  assert.equal(config.resolveShopifyConfig(live).endpoint, 'https://shop.myshopify.com/api/2026-07/graphql.json');
  assert.throws(() => config.resolveShopifyConfig({ ...live, PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'shpat_private' }), /PUBLIC Storefront/);
  assert.throws(() => config.resolveShopifyConfig({ ...live, PUBLIC_SHOPIFY_STORE_DOMAIN: 'shop.myshopify.com/evil' }), /permanent/);
  assert.throws(() => config.resolveShopifyConfig({ ...live, PUBLIC_SHOPIFY_API_VERSION: 'latest' }), /stable quarterly/);
});

test('the production browser bundle receives public Shopify config without Node globals', async () => {
  const output = await build({
    root: fileURLToPath(new URL('../../..', import.meta.url)),
    configFile: false,
    envFile: false,
    envPrefix: 'PUBLIC_',
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'src/lib/shopify/config.ts', name: 'ShopifyConfig', formats: ['iife'] },
    },
  });
  const context = {};
  const bundle = Array.isArray(output) ? output[0] : output;
  runInNewContext(bundle.output[0].code, context);
  assert.equal(context.ShopifyConfig.isMockMode, false);
  assert.equal(context.ShopifyConfig.MERCH_ENABLED, true);
  assert.equal(context.ShopifyConfig.SHOPIFY_TOKEN, 'public-test-token');
  assert.equal(context.ShopifyConfig.STOREFRONT_ENDPOINT, 'https://integration-test.myshopify.com/api/2026-07/graphql.json');
});

test('live failures never become an empty published catalog', async () => {
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
  await assert.rejects(shop.getCourses('cs'), /401/);
  globalThis.fetch = async () => Response.json({ errors: [{ message: 'Access denied to quantityAvailable' }] });
  await assert.rejects(shop.getMerch('en'), /Access denied/);
  globalThis.fetch = async () => new Response('<html>Bad gateway</html>');
  await assert.rejects(shop.getArticles('cs'), /invalid JSON/);
});

test('all collection pages and variant pages are included in static routes', async () => {
  const calls = [];
  fakeAPI(({ query, variables }) => {
    calls.push(variables);
    assert.equal(variables.language, 'CS');
    if (query.includes('query ProductVariants')) {
      return { product: { variants: variables.after
        ? connection([variant('date-3')])
        : connection([variant('date-1'), variant('date-2')], 'variant-next') } };
    }
    return { collection: { products: variables.after
      ? connection([product('second')])
      : connection([product('first', connection([variant('date-1')], 'overflow'))], 'product-next') } };
  });
  const products = await shop.getCourses('cs');
  assert.deepEqual(products.map((item) => item.handle), ['first', 'second']);
  assert.deepEqual(products[0].variants.map((item) => item.id), ['date-1', 'date-2', 'date-3']);
  assert.equal(calls.length, 4);
});

test('a missing course collection fails clearly; an empty merch collection stays empty', async () => {
  fakeAPI(() => ({ collection: null }));
  await assert.rejects(shop.getCourses('en'), /missing or not published/);
  let count = 0;
  fakeAPI(() => { count++; return { collection: { products: connection([]) } }; });
  assert.deepEqual(await shop.getMerch('en'), []);
  assert.equal(count, 1);
});

test('pagination cannot loop indefinitely on an invalid cursor', async () => {
  fakeAPI(() => ({ blog: { articles: connection([], 'repeated') } }));
  await assert.rejects(shop.getArticles('cs'), /invalid pagination cursor/);
});

test('course availability excludes past dates and unavailable seats; dates use Prague time', () => {
  const course = {
    variants: [
      variant('past', { startsAt: '2026-10-01T08:00:00Z' }),
      variant('later', { startsAt: '2026-11-01T09:00:00Z' }),
      variant('full', { startsAt: '2026-10-20T08:00:00Z', quantityAvailable: 0 }),
      variant('invalid', { startsAt: 'not-a-date' }),
      variant('next', { startsAt: '2026-10-20T08:00:00Z' }),
    ],
  };
  assert.deepEqual(shop.bookableVariants(course, Date.parse('2026-10-09T08:00:00Z')).map((item) => item.id), ['next', 'later']);
  assert.match(shop.formatDateTime('2026-11-01T09:00:00Z', 'en'), /10:00/);
  assert.match(shop.formatDateTime('2026-07-01T08:00:00Z', 'en'), /10:00/);
});

test('a cart with omitted lines is refused instead of displaying an incorrect subtotal', () => {
  assert.throws(() => normalizeCart({ lines: { pageInfo: { hasNextPage: true }, nodes: [] } }), /more than 250/);
});

test('cart lines retain course dates and flag missing schedules without marking merch as courses', () => {
  const cart = normalizeCart({
    lines: connection([
      { merchandise: { startsAt: { value: '2026-11-01T09:00:00Z' }, product: { productType: 'Course' } } },
      { merchandise: { product: { tags: ['course'] } } },
      { merchandise: { product: { productType: 'Merchandise' } } },
    ]),
  });
  assert.equal(cart.lines[0].courseStartsAt, '2026-11-01T09:00:00Z');
  assert.equal(cart.lines[1].courseStartsAt, null);
  assert.equal('courseStartsAt' in cart.lines[2], false);
});

test('merchandise defaults hidden and requires an explicit true flag to restore', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    assert.equal(config.resolveShopifyConfig({ PUBLIC_MERCH_ENABLED: value }).merchEnabled, false);
  }
  assert.equal(config.resolveShopifyConfig({ PUBLIC_MERCH_ENABLED: 'true' }).merchEnabled, true);
  assert.equal(hiddenShop.MERCH_ENABLED, false);
  assert.equal(shop.MERCH_ENABLED, true);
});

test('hidden merchandise lists perform no Storefront API calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No request expected'); };
  assert.deepEqual(await hiddenShop.getMerch('cs'), []);
  assert.deepEqual(await hiddenShop.getMerch('en'), []);
  assert.equal(calls, 0);
});

test('direct hidden product lookups reject merchandise and gift cards but retain courses', async () => {
  fakeAPI(({ variables }) => {
    const raw = product(variables.handle);
    if (variables.handle !== 'course') {
      raw.productType = variables.handle === 'gift' ? 'Gift Card' : 'Merchandise';
      raw.tags = [];
    }
    return { product: raw };
  });
  assert.equal(await hiddenShop.getProduct('tshirt', 'cs'), null);
  assert.equal(await hiddenShop.getProduct('gift', 'en'), null);
  assert.equal((await hiddenShop.getProduct('course', 'en')).handle, 'course');
  assert.equal((await shop.getProduct('tshirt', 'en')).handle, 'tshirt');
  assert.equal((await shop.getProduct('gift', 'en')).handle, 'gift');
});

test('noncourse products accidentally placed in the course collection stay hidden', async () => {
  const course = product('course');
  const merch = { ...product('tshirt'), productType: 'Merchandise', tags: [] };
  const gift = { ...product('gift'), productType: 'Gift Card', tags: [] };
  fakeAPI(() => ({ collection: { products: connection([course, merch, gift]) } }));
  assert.deepEqual((await hiddenShop.getCourses('cs')).map((item) => item.handle), ['course']);
});

test('the retired espresso course stays hidden if its old Shopify record is still published', async () => {
  fakeAPI(() => ({ collection: { products: connection([
    product('espresso-zaklady', connection([variant('old-date')], 'old-variants')),
    product('cupping'), product('new-course'),
  ]) } }));
  for (const client of [shop, hiddenShop]) {
    for (const lang of ['cs', 'en']) {
      assert.deepEqual((await client.getCourses(lang)).map((item) => item.handle), ['cupping', 'new-course']);
    }
  }

  globalThis.fetch = async () => { throw new Error('Retired direct lookups must not call Shopify.'); };
  for (const client of [shop, hiddenShop, demoShop]) {
    for (const lang of ['cs', 'en']) {
      assert.equal(await client.getProduct('espresso-zaklady', lang), null);
    }
  }

  fakeAPI(() => ({ product: product('espresso-zaklady') }));
  assert.equal(await hiddenShop.getProduct('old-course-alias', 'cs'), null);
});

test('demo courses contain cupping instead of the retired espresso course', async () => {
  for (const lang of ['cs', 'en']) {
    const handles = (await demoShop.getCourses(lang)).map((item) => item.handle);
    assert(handles.includes('cupping'));
    assert(!handles.includes('espresso-zaklady'));
  }
});

test('course availability summaries respect configured capacity without inventing unknown inventory', () => {
  const course = { course: { capacity: 3 }, variants: [
    variant('date', { startsAt: '2099-10-10T12:00:00Z', quantityAvailable: 8 }),
  ] };
  assert.equal(shop.bookableVariants(course)[0].quantityAvailable, 3);
  assert.equal(shop.seatsRemaining(course), 3);
  course.variants[0].quantityAvailable = null;
  assert.equal(shop.seatsRemaining(course), null);
  course.course.capacity = 0;
  assert.deepEqual(shop.bookableVariants(course), []);
});
