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
  const { getMerch, getGiftCards, getCourses, getArticles } = await import('../src/lib/shopify');
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
  const [merch, giftCards, courses, articles] = await Promise.all([
    config.MERCH_ENABLED ? getMerch('cs') : Promise.resolve([]),
    config.GIFT_CARDS_ENABLED ? getGiftCards('cs') : Promise.resolve([]),
    getCourses('cs'),
    getArticles('cs'),
  ]);
  if (!courses.length) throw new Error('Publish course products to the Headless channel and check the course collection handle. The course catalog is empty.');
  if (config.MERCH_ENABLED && !merch.length) throw new Error('Merchandise is enabled but its catalog is empty. Publish merchandise to the Headless channel and check the collection handle, or set PUBLIC_MERCH_ENABLED=false.');
  if (config.GIFT_CARDS_ENABLED && !giftCards.length) {
    throw new Error('Gift cards are enabled but no native Shopify gift card products are available. Create a gift card product in Shopify Admin, publish it to the Headless channel, or set PUBLIC_GIFT_CARDS_ENABLED=false. An ordinary product named voucher does not issue a redeemable code.');
  }
  for (const giftCard of giftCards) {
    if (!giftCard.isGiftCard || !giftCard.variants.length || giftCard.variants.some(variant =>
      !Number.isFinite(Number(variant.price.amount)) || Number(variant.price.amount) <= 0 || variant.price.currencyCode !== 'CZK',
    )) {
      throw new Error(`Gift card "${giftCard.handle}" needs native Shopify gift-card denominations with positive CZK prices.`);
    }
  }
  const giftCardVariants = giftCards.flatMap(product => product.variants);
  // Digital gift cards do not require tracked seat inventory; Shopify's sale flag applies.
  if (config.GIFT_CARDS_ENABLED && !giftCardVariants.some(variant => variant.availableForSale)) {
    throw new Error('No gift-card denomination is available for sale. Check Headless publication and market availability before launch.');
  }
  const courseVariants = courses.flatMap(product => product.variants);
  if (courseVariants.some(variant => variant.quantityAvailable === null)) {
    throw new Error('Course inventory is unavailable. Enable product inventory permission on the Headless storefront.');
  }
  const requestedCapacities: Record<string, number> = {
    'latte-art': 2,
    cupping: 4,
    'filtrovana-kava': 4,
  };
  for (const course of courses) {
    const capacity = course.course?.capacity;
    if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`Course "${course.handle}" needs a positive integer course.capacity metafield with Storefront API access.`);
    }
    const requestedCapacity = requestedCapacities[course.handle];
    if (requestedCapacity !== undefined && capacity !== requestedCapacity) {
      throw new Error(`Course "${course.handle}" must have capacity ${requestedCapacity}; Shopify currently reports ${capacity}.`);
    }
    if (course.variants.length === 0) throw new Error(`Course "${course.handle}" has no scheduled variants.`);
    if (course.variants.some(variant =>
      typeof variant.quantityAvailable !== 'number' || !Number.isInteger(variant.quantityAvailable) ||
      variant.quantityAvailable < 0 || variant.quantityAvailable > capacity,
    )) {
      throw new Error(`Course "${course.handle}" seat inventory must be a whole number between 0 and its capacity (${capacity}).`);
    }
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
  console.log(`Catalog OK: ${merch.length} merchandise products, ${giftCards.length} native gift cards, ${courses.length} courses, ${articles.length} articles.`);
  if (!config.MERCH_ENABLED) console.log('Physical merchandise is hidden; course and gift-card availability are checked independently.');
  if (giftCards.length) console.log('Gift-card issuance, fulfillment email and redemption need a separate Shopify order test. A sample PDF is not a redeemable gift card.');
  if (!process.argv.includes('--cart')) {
    console.log('Read-only verification passed. Use --cart to create and empty a test cart (no order or payment).');
    return;
  }
  const variant = giftCardVariants.find(item => item.availableForSale)
    ?? merch.flatMap(product => product.variants).find(item => item.availableForSale)
    ?? courseVariants.find(item => item.availableForSale && item.quantityAvailable !== null &&
      item.quantityAvailable > 0 && isFutureCourseDate(item.startsAt));
  if (!variant) throw new Error('No available gift-card or merchandise variant, or future course session with stock for the cart check.');
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
