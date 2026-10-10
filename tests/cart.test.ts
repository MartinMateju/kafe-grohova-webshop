import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartStore, type LineSnapshot } from '../src/lib/cart';
import type { Product } from '../src/lib/shopify/types';
import type { storefront } from '../src/lib/shopify/client';
import { CART_CREATE, CART_LINES_ADD, CART_LINES_REMOVE, CART_QUERY } from '../src/lib/shopify/queries';
import { isFutureCourseDate } from '../src/lib/courseAvailability';
import { safeScriptJson } from '../src/lib/safeScriptJson';

const snapshot: LineSnapshot = {
  merchandiseId: 'variant-1', productTitle: 'Coffee', variantTitle: '250 g',
  productHandle: 'coffee', amount: '200', currencyCode: 'CZK', quantityAvailable: 3,
};
function rawCart(id = 'cart-1', quantity = 1, merchandiseId = snapshot.merchandiseId) {
  return {
    id, checkoutUrl: 'https://test.myshopify.com/cart/c/test', totalQuantity: quantity,
    cost: { subtotalAmount: { amount: String(quantity * 200), currencyCode: 'CZK' } },
    lines: { nodes: quantity ? [{
      id: 'line-1', quantity,
      merchandise: { id: merchandiseId, title: '250 g', product: { title: 'Coffee', handle: 'coffee' } },
      cost: {
        amountPerQuantity: { amount: '200', currencyCode: 'CZK' },
        totalAmount: { amount: String(quantity * 200), currencyCode: 'CZK' },
      },
    }] : [], pageInfo: { hasNextPage: false } },
  };
}
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
const blockedStorage = {
  getItem() { throw new Error('Storage denied'); },
  setItem() { throw new Error('Storage denied'); },
  removeItem() { throw new Error('Storage denied'); },
};

test('demo cart survives blocked storage and limits total quantity to the stock snapshot', async () => {
  const cart = createCartStore({ merchEnabled: true, mock: true, storage: blockedStorage });
  assert.equal(await cart.initCart(), true);
  assert.equal(await cart.addLine(snapshot, 2), true);
  assert.equal(await cart.addLine(snapshot, 2), false);
  assert.equal(cart.getState().cart?.totalQuantity, 2);
  assert.match(cart.getState().error!, /Only 3/);
  const id = cart.getState().cart!.lines[0].id;
  assert.equal(await cart.updateLine(id, 3), true);
  assert.equal(await cart.updateLine(id, 4), false);
  assert.equal(cart.getState().cart?.subtotal.amount, '600.00');
  assert.equal(await cart.removeLine(id), true);
  assert.equal(cart.getState().cart?.totalQuantity, 0);
});

test('demo line identities are stable and prefix matches never remove another product', async () => {
  const cart = createCartStore({ merchEnabled: true, mock: true, storage: memoryStorage() });
  await cart.addLine(snapshot);
  await cart.addLine({ ...snapshot, merchandiseId: 'variant-10' });
  const first = cart.getState().cart!.lines[0].id;
  const second = cart.getState().cart!.lines[1].id;
  await cart.removeLine(first);
  assert.equal(cart.getState().cart!.lines[0].id, second);
  await cart.updateLine(second, 2);
  assert.equal(cart.getState().cart?.totalQuantity, 2);
});

test('concurrent additions create only one Shopify cart even with storage denied', async () => {
  const calls: string[] = [];
  const variables: Record<string, unknown>[] = [];
  const request = (async (query: string, vars: Record<string, unknown>) => {
    calls.push(query);
    variables.push(vars);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return query === CART_CREATE
      ? { cartCreate: { cart: rawCart(), userErrors: [] } }
      : { cartLinesAdd: { cart: rawCart('cart-1', 2), userErrors: [] } };
  }) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: blockedStorage, request });
  const first = cart.addLine(snapshot);
  const second = cart.addLine(snapshot);
  assert.equal(cart.getState().loading, true);
  assert.equal(await first, true);
  assert.equal(cart.getState().loading, true);
  assert.equal(await second, true);
  assert.deepEqual(calls, [CART_CREATE, CART_LINES_ADD]);
  assert.equal(variables[1].cartId, 'cart-1');
  assert.equal(variables[1].language, 'CS');
  assert.equal(cart.getState().cart?.totalQuantity, 2);
  assert.equal(cart.getState().loading, false);
});

test('initial cart fetch completes before an add can overwrite it', async () => {
  const calls: string[] = [];
  const request = (async (query: string) => {
    calls.push(query);
    if (query === CART_QUERY) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { cart: rawCart() };
    }
    return { cartLinesAdd: { cart: rawCart('cart-1', 2), userErrors: [] } };
  }) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request });
  await Promise.all([cart.initCart(), cart.addLine(snapshot)]);
  assert.deepEqual(calls, [CART_QUERY, CART_LINES_ADD]);
  assert.equal(cart.getState().cart?.totalQuantity, 2);
});

test('Shopify failures return false and remain visible even on an empty cart', async () => {
  const request = (async () => ({
    cartCreate: { cart: null, userErrors: [{ message: 'No seats remaining.' }] },
  })) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: null, request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.equal(cart.getState().cart, null);
  assert.equal(cart.getState().open, true);
  assert.equal(cart.getState().error, 'No seats remaining.');
  assert.equal(cart.getState().loading, false);
});

test('expired-cart userErrors retry once and preserve the retry error', async () => {
  const calls: string[] = [];
  const request = (async (query: string) => {
    calls.push(query);
    if (query === CART_LINES_ADD) return { cartLinesAdd: { cart: null, userErrors: [{ message: 'Cart does not exist.' }] } };
    if (query === CART_QUERY) return { cart: null };
    return { cartCreate: { cart: null, userErrors: [{ message: 'Product is sold out.' }] } };
  }) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: memoryStorage({ kafe_cart_id: 'old-cart' }), request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.deepEqual(calls, [CART_LINES_ADD, CART_QUERY, CART_CREATE]);
  assert.equal(cart.getState().error, 'Product is sold out.');
});

test('a variant error on a valid cart does not create a replacement cart', async () => {
  const calls: string[] = [];
  const request = (async (query: string) => {
    calls.push(query);
    return query === CART_LINES_ADD
      ? { cartLinesAdd: { cart: null, userErrors: [{ message: 'Variant is unavailable.' }] } }
      : { cart: rawCart() };
  }) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.deepEqual(calls, [CART_LINES_ADD, CART_QUERY]);
  assert.equal(cart.getState().error, 'Variant is unavailable.');
});

test('Shopify inventory warnings surface and zero additions are not reported as success', async () => {
  const request = (async () => ({
    cartCreate: { cart: rawCart('cart-1', 0), warnings: [{ message: 'Not enough inventory.' }], userErrors: [] },
  })) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true, mock: false, storage: null, request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.equal(cart.getState().error, 'Not enough inventory.');
  assert.equal(await cart.checkout(), false);
});

test('course dates require a valid future timestamp at the moment of adding or updating', async () => {
  let now = Date.parse('2026-10-09T12:00:00Z');
  const cart = createCartStore({ merchEnabled: true, mock: true, storage: null, now: () => now });
  for (const startsAt of [null, '', 'not a date', '2027-02-30T12:00:00Z', '2026-10-10', '2026-10-09T12:00:00Z', '2026-10-08T12:00:00Z']) {
    assert.equal(await cart.addLine({ ...snapshot, startsAt }), false);
  }
  const startsAt = '2026-10-10T12:00:00+02:00';
  assert.equal(await cart.addLine({ ...snapshot, startsAt }, 2), true);
  const id = cart.getState().cart!.lines[0].id;
  now = Date.parse('2026-10-11T12:00:00Z');
  assert.equal(await cart.updateLine(id, 3), false);
  assert.equal(isFutureCourseDate(startsAt, now), false);
});

test('corrupt saved carts fail safely and inline JSON cannot terminate its script', async () => {
  const cart = createCartStore({ merchEnabled: true, mock: true, storage: memoryStorage({ kafe_cart_mock: '{"broken":true}' }) });
  assert.equal(await cart.initCart(), true);
  assert.equal(cart.getState().cart?.totalQuantity, 0);
  const value = { title: '</script><img src=x onerror=alert(1)>' };
  const serialized = safeScriptJson(value);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), value);
});

test('checkout rechecks a saved course against current time and blocks expired dates', async () => {
  let now = Date.parse('2026-10-09T12:00:00Z');
  let queryCount = 0;
  let navigated = false;
  const course: any = rawCart();
  course.lines.nodes[0].merchandise.product.productType = 'Course';
  course.lines.nodes[0].merchandise.startsAt = { value: '2026-10-10T12:00:00Z' };
  const request = (async () => { queryCount += 1; return { cart: course }; }) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true,
    mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
    now: () => now, navigate: () => { navigated = true; },
  });
  await cart.initCart();
  now = Date.parse('2026-10-11T12:00:00Z');
  assert.equal(await cart.checkout(), false);
  assert.equal(queryCount, 2);
  assert.equal(navigated, false);
  assert.match(cart.getState().error!, /course.*no longer available/);
  assert.equal(cart.getState().open, true);
});

test('checkout refresh detects expiration and redirects only for a current valid cart', async () => {
  let current: ReturnType<typeof rawCart> | null = rawCart();
  let destination = '';
  const request = (async () => ({ cart: current })) as typeof storefront;
  const cart = createCartStore({ merchEnabled: true,
    mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
    navigate: (url) => { destination = url; },
  });
  await cart.initCart();
  assert.equal(await cart.checkout(), true);
  assert.equal(destination, current.checkoutUrl);
  destination = '';
  current = null;
  assert.equal(await cart.checkout(), false);
  assert.equal(destination, '');
  assert.equal(cart.getState().cart, null);
  assert.match(cart.getState().error!, /expired/);
});

const courseStart = '2099-10-10T12:00:00Z';
const courseSnapshot: LineSnapshot = {
  ...snapshot, merchandiseId: 'course-date', productHandle: 'espresso-course',
  productTitle: 'Espresso course', variantTitle: '10 October', startsAt: courseStart,
};
function currentCourse(capacity = 3, quantityAvailable = 8): Product {
  return {
    id: 'course', handle: courseSnapshot.productHandle, title: 'Espresso course',
    productType: 'Course', tags: ['course'],
    description: '', descriptionHtml: '', availableForSale: true, featuredImage: null, images: [], options: [],
    priceRange: { minVariantPrice: { amount: '200', currencyCode: 'CZK' }, maxVariantPrice: { amount: '200', currencyCode: 'CZK' } },
    course: { capacity, durationMinutes: 120, level: null, syllabus: [] },
    variants: [{
      id: courseSnapshot.merchandiseId, title: '10 October', availableForSale: quantityAvailable > 0,
      compareAtPrice: null, selectedOptions: [], image: null, endsAt: null,
      quantityAvailable, startsAt: courseStart, price: { amount: '200', currencyCode: 'CZK' },
    }],
  };
}
function courseCart(quantity = 1): any {
  const cart: any = rawCart('cart-1', quantity, courseSnapshot.merchandiseId);
  cart.lines.nodes[0].id = 'course-line';
  cart.lines.nodes[0].merchandise.startsAt = { value: courseStart };
  cart.lines.nodes[0].merchandise.product = {
    title: 'Espresso course', handle: courseSnapshot.productHandle, productType: 'Course', tags: ['course'],
  };
  return cart;
}
function mixedCart(): any {
  const cart = courseCart();
  cart.lines.nodes.push(...rawCart().lines.nodes);
  cart.totalQuantity = 2;
  cart.cost.subtotalAmount.amount = '400';
  return cart;
}

test('hidden merchandise cannot be added in demo or live mode, including gift cards and forged course markers', async () => {
  for (const mock of [true, false]) {
    let requests = 0;
    const cart = createCartStore({
      mock, merchEnabled: false, storage: null,
      demoCourses: () => [currentCourse()],
      lookupProduct: async () => ({ ...currentCourse(), productType: 'Gift Card', tags: [], course: null,
        variants: [{ ...currentCourse().variants[0], startsAt: null }] }),
      request: (async () => { requests++; throw new Error('No Shopify mutation should be sent.'); }) as typeof storefront,
    });
    assert.equal(await cart.addLine(snapshot), false);
    assert.equal(await cart.addLine({ ...snapshot, productHandle: 'gift-card' }), false);
    assert.equal(await cart.addLine({ ...snapshot, startsAt: courseStart }), false);
    assert.match(cart.getState().error!, /Merchandise is temporarily unavailable/);
    assert.equal(requests, 0);
    assert.equal(cart.getState().cart, null);
  }
});

test('restored demo carts remove hidden items and clamp stale course seats to current capacity and stock', async () => {
  const persisted = [
    { ...snapshot, quantity: 2 },
    { ...snapshot, merchandiseId: 'gift-card', productHandle: 'gift-card', startsAt: courseStart, quantity: 1 },
    { ...courseSnapshot, quantityAvailable: 99, quantity: 8 },
  ];
  const storage = memoryStorage({ kafe_cart_mock: JSON.stringify(persisted) });
  const cart = createCartStore({
    mock: true, merchEnabled: false, storage, demoCourses: () => [currentCourse(3, 8)],
  });
  assert.equal(await cart.initCart(), true);
  assert.equal(cart.getState().cart?.lines.length, 1);
  assert.equal(cart.getState().cart?.totalQuantity, 3);
  assert.match(cart.getState().notice!, /saved cart was updated/);
  const saved = JSON.parse(storage.getItem('kafe_cart_mock')!);
  assert.equal(saved[0].quantityAvailable, 3);
  assert.equal(saved[0].startsAt, courseStart);
  assert.equal(await cart.addLine({ ...courseSnapshot, quantityAvailable: 99 }), false);
  assert.equal(await cart.updateLine(cart.getState().cart!.lines[0].id, 4), false);
  assert.equal(cart.getState().cart?.totalQuantity, 3);

  const lowerStock = createCartStore({
    mock: true, merchEnabled: false, storage, demoCourses: () => [currentCourse(3, 1)],
  });
  await lowerStock.initCart();
  assert.equal(lowerStock.getState().cart?.totalQuantity, 1);
});

test('restored live carts remove merchandise on Shopify before exposing a checkout URL', async () => {
  const calls: string[] = [];
  const request = (async (query: string, variables: Record<string, unknown>) => {
    calls.push(query);
    if (query === CART_QUERY) return { cart: mixedCart() };
    assert.equal(query, CART_LINES_REMOVE);
    assert.deepEqual(variables.lineIds, ['line-1']);
    return { cartLinesRemove: { cart: courseCart(), userErrors: [] } };
  }) as typeof storefront;
  const cart = createCartStore({
    mock: false, merchEnabled: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
  });
  assert.equal(await cart.initCart(), true);
  assert.deepEqual(calls, [CART_QUERY, CART_LINES_REMOVE]);
  assert.equal(cart.getState().cart?.totalQuantity, 1);
  assert.equal(cart.getState().cart?.lines[0].merchandiseId, courseSnapshot.merchandiseId);
  assert.match(cart.getState().notice!, /removed from your cart/);
});

test('failed live-cart cleanup blocks checkout instead of hiding unremoved merchandise totals', async () => {
  let navigated = false;
  const request = (async (query: string) => query === CART_QUERY
    ? { cart: mixedCart() }
    : { cartLinesRemove: { cart: null, userErrors: [{ message: 'Try again.' }] } }) as typeof storefront;
  const cart = createCartStore({
    mock: false, merchEnabled: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
    navigate: () => { navigated = true; },
  });
  assert.equal(await cart.initCart(), false);
  assert.equal(cart.getState().cart, null);
  assert.match(cart.getState().error!, /checkout is blocked/);
  assert.equal(await cart.checkout(), false);
  assert.equal(navigated, false);
});

test('checkout cleans remotely restored merchandise and requires review before redirecting', async () => {
  let queries = 0;
  let navigated = false;
  const request = (async (query: string) => {
    if (query === CART_QUERY) return { cart: ++queries === 2 ? mixedCart() : courseCart() };
    return { cartLinesRemove: { cart: courseCart(), userErrors: [] } };
  }) as typeof storefront;
  const cart = createCartStore({
    mock: false, merchEnabled: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
    lookupProduct: async () => currentCourse(), navigate: () => { navigated = true; },
  });
  await cart.initCart();
  assert.equal(await cart.checkout(), false);
  assert.match(cart.getState().error!, /review your cart/);
  assert.equal(navigated, false);
  assert.equal(cart.getState().cart?.totalQuantity, 1);
  assert.equal(await cart.checkout(), true);
  assert.equal(navigated, true);
});

test('live course additions, updates and checkout respect capacity with merchandise hidden or restored', async () => {
  for (const merchEnabled of [false, true]) {
    let requests = 0;
    const request = (async () => { requests++; return { cart: courseCart(4) }; }) as typeof storefront;
    const cart = createCartStore({
      mock: false, merchEnabled, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
      lookupProduct: async () => currentCourse(3, 8),
    });
    assert.equal(await cart.addLine({ ...courseSnapshot, quantityAvailable: 99 }, 4), false);
    assert.equal(requests, 0);
    assert.match(cart.getState().error!, /Only 3 seats/);
    await cart.initCart();
    assert.equal(await cart.updateLine('course-line', 5), false);
    assert.equal(requests, 1, 'An over-capacity update must not reach Shopify.');
    assert.match(cart.getState().error!, /Only 3 seats/);
    assert.equal(await cart.checkout(), false);
    assert.match(cart.getState().error!, /Only 3 seats remain/);
  }
});

function cartWithRetiredCourse(): any {
  const cart = mixedCart();
  const retired = courseCart().lines.nodes[0];
  retired.id = 'retired-line';
  retired.merchandise.id = 'retired-date';
  retired.merchandise.product.handle = 'espresso-zaklady';
  cart.lines.nodes.push(retired);
  cart.totalQuantity = 3;
  cart.cost.subtotalAmount.amount = '600';
  return cart;
}

test('restored live carts always remove retired courses and retain merchandise only when enabled', async () => {
  for (const merchEnabled of [false, true]) {
    const calls: string[] = [];
    const request = (async (query: string, variables: Record<string, unknown>) => {
      calls.push(query);
      if (query === CART_QUERY) return { cart: cartWithRetiredCourse() };
      assert.equal(query, CART_LINES_REMOVE);
      assert.deepEqual(variables.lineIds, merchEnabled ? ['retired-line'] : ['line-1', 'retired-line']);
      return { cartLinesRemove: { cart: merchEnabled ? mixedCart() : courseCart(), userErrors: [] } };
    }) as typeof storefront;
    const cart = createCartStore({
      mock: false, merchEnabled, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
    });
    assert.equal(await cart.initCart(), true);
    assert.deepEqual(calls, [CART_QUERY, CART_LINES_REMOVE]);
    assert.deepEqual(cart.getState().cart?.lines.map(line => line.productHandle),
      merchEnabled ? [courseSnapshot.productHandle, snapshot.productHandle] : [courseSnapshot.productHandle]);
    assert.equal(cart.getState().notice, 'Unavailable items were removed from your cart.');
  }
});

test('Shopify retaining a retired course after cleanup keeps checkout blocked', async () => {
  const request = (async (query: string) => query === CART_QUERY
    ? { cart: cartWithRetiredCourse() }
    : { cartLinesRemove: { cart: cartWithRetiredCourse(), userErrors: [] } }) as typeof storefront;
  const cart = createCartStore({
    mock: false, merchEnabled: true, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request,
  });
  assert.equal(await cart.initCart(), false);
  assert.equal(cart.getState().cart, null);
  assert.match(cart.getState().error!, /checkout is blocked/);
  assert.equal(await cart.checkout(), false);
});

test('restoring merchandise never restores a retired course in a demo cart', async () => {
  const retired = { ...courseSnapshot, productHandle: 'espresso-zaklady', quantity: 1 };
  const cart = createCartStore({
    mock: true, merchEnabled: true,
    storage: memoryStorage({ kafe_cart_mock: JSON.stringify([retired, { ...snapshot, quantity: 1 }]) }),
  });
  assert.equal(await cart.initCart(), true);
  assert.deepEqual(cart.getState().cart?.lines.map(line => line.productHandle), [snapshot.productHandle]);
  assert.equal(await cart.addLine(retired), false);
  assert.match(cart.getState().error!, /course is no longer available/);
});
