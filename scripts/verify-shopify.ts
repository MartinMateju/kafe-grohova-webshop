import { loadEnv } from 'vite';
import { isFutureCourseDate } from '../src/lib/courseAvailability';

// Same public configuration as the production build. Never print access tokens.
for (const [key, value] of Object.entries(loadEnv('production', process.cwd(), 'PUBLIC_'))) {
  process.env[key] ??= value;
}

async function main() {
  const connectionOnly = process.argv.includes('--connection-only');
  if (connectionOnly && process.argv.includes('--cart')) {
    throw new Error('Use --connection-only for a read-only connection check, or --cart for the full cart check.');
  }
  const config = await import('../src/lib/shopify/config');
  if (config.isMockMode) throw new Error('No live Shopify store is configured. Set Kafe Grohova’s own domain and public Storefront token in .env, then use PUBLIC_SHOPIFY_MODE=live.');
  const { storefront } = await import('../src/lib/shopify/client');
  const { getMerch, getCourses, getArticles } = await import('../src/lib/shopify');
  const { CART_CREATE, CART_LINES_REMOVE } = await import('../src/lib/shopify/queries');
  const { shop } = await storefront<{ shop: { name: string; primaryDomain: { host: string }; paymentSettings: { currencyCode: string } } }>(`
    query VerifyShop { shop { name primaryDomain { host } paymentSettings { currencyCode } } }
  `);
  console.log(`Connected: ${config.SHOPIFY_DOMAIN} (${shop.name}), currency ${shop.paymentSettings.currencyCode}`);
  if (connectionOnly) {
    console.log('Connection verified. Products, currency, inventory, course dates and checkout still require full verification before launch.');
    return;
  }
  if (shop.paymentSettings.currencyCode !== 'CZK') {
    throw new Error('This catalog uses CZK prices. Configure the dedicated Shopify store currency as CZK before importing the demo products.');
  }
  const [merch, courses, articles] = await Promise.all([getMerch('cs'), getCourses('cs'), getArticles('cs')]);
  if (!merch.length || !courses.length) throw new Error('Publish merchandise and course products to the Headless channel and check collection handles. One or both catalogs are empty.');
  const courseVariants = courses.flatMap(product => product.variants);
  if (courseVariants.some(variant => variant.quantityAvailable === null)) {
    throw new Error('Course inventory is unavailable. Enable product inventory permission on the Headless storefront.');
  }
  if (courseVariants.some(variant => !variant.startsAt)) {
    throw new Error('Course dates are missing: set public course.starts_at variant metafields before accepting bookings.');
  }
  if (courseVariants.some(variant => !isFutureCourseDate(variant.startsAt, Number.NEGATIVE_INFINITY))) {
    throw new Error('A course starts_at timestamp is invalid. Use ISO dates with a timezone, such as 2026-10-24T10:00:00+02:00.');
  }
  if (!courseVariants.some(variant => variant.availableForSale && variant.quantityAvailable !== null && variant.quantityAvailable > 0 && isFutureCourseDate(variant.startsAt))) {
    console.warn('No future course session has available seats. Course booking cannot be tested until a future session has stock.');
  }
  console.log(`Catalog OK: ${merch.length} merchandise products, ${courses.length} courses, ${articles.length} articles.`);
  if (!process.argv.includes('--cart')) {
    console.log('Read-only verification passed. Use --cart to create and empty a test cart (no order or payment).');
    return;
  }
  const variant = [...merch, ...courses].flatMap(product => product.variants).find(item => item.availableForSale);
  if (!variant) throw new Error('No available variant for the cart check.');
  const data = await storefront<any>(CART_CREATE, { lines: [{ merchandiseId: variant.id, quantity: 1 }], language: 'CS' });
  const payload = data.cartCreate;
  if (payload?.userErrors?.length) throw new Error(payload.userErrors.map((item: any) => item.message).join('; '));
  const cart = payload?.cart;
  if (!cart?.id) throw new Error('Shopify did not return a test cart.');
  try {
    if (!cart.lines?.nodes?.length || !cart.checkoutUrl?.startsWith('https://')) throw new Error('Shopify did not return a line and secure checkout URL.');
    if (payload.warnings?.length) throw new Error(payload.warnings.map((item: any) => item.message).join('; '));
    console.log('Test cart created; Shopify returned a checkout URL. No checkout was opened and no order was placed.');
  } finally {
    if (cart.lines?.nodes?.length) {
      const cleanup = await storefront<any>(CART_LINES_REMOVE, { cartId: cart.id, lineIds: cart.lines.nodes.map((line: any) => line.id), language: 'CS' });
      if (cleanup.cartLinesRemove?.userErrors?.length || cleanup.cartLinesRemove?.cart?.totalQuantity !== 0) throw new Error('Test cart cleanup did not complete. No order was placed.');
      console.log('Test cart emptied.');
    }
  }
}

main().catch(error => {
  console.error(`Shopify verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
