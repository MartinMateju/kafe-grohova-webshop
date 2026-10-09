import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartStore, type LineSnapshot } from '../src/lib/cart';
import type { storefront } from '../src/lib/shopify/client';
import { CART_CREATE, CART_LINES_ADD, CART_QUERY } from '../src/lib/shopify/queries';
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
  const cart = createCartStore({ mock: true, storage: blockedStorage });
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
  const cart = createCartStore({ mock: true, storage: memoryStorage() });
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
  const cart = createCartStore({ mock: false, storage: blockedStorage, request });
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
  const cart = createCartStore({ mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request });
  await Promise.all([cart.initCart(), cart.addLine(snapshot)]);
  assert.deepEqual(calls, [CART_QUERY, CART_LINES_ADD]);
  assert.equal(cart.getState().cart?.totalQuantity, 2);
});

test('Shopify failures return false and remain visible even on an empty cart', async () => {
  const request = (async () => ({
    cartCreate: { cart: null, userErrors: [{ message: 'No seats remaining.' }] },
  })) as typeof storefront;
  const cart = createCartStore({ mock: false, storage: null, request });
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
  const cart = createCartStore({ mock: false, storage: memoryStorage({ kafe_cart_id: 'old-cart' }), request });
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
  const cart = createCartStore({ mock: false, storage: memoryStorage({ kafe_cart_id: 'cart-1' }), request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.deepEqual(calls, [CART_LINES_ADD, CART_QUERY]);
  assert.equal(cart.getState().error, 'Variant is unavailable.');
});

test('Shopify inventory warnings surface and zero additions are not reported as success', async () => {
  const request = (async () => ({
    cartCreate: { cart: rawCart('cart-1', 0), warnings: [{ message: 'Not enough inventory.' }], userErrors: [] },
  })) as typeof storefront;
  const cart = createCartStore({ mock: false, storage: null, request });
  assert.equal(await cart.addLine(snapshot), false);
  assert.equal(cart.getState().error, 'Not enough inventory.');
  assert.equal(await cart.checkout(), false);
});

test('course dates require a valid future timestamp at the moment of adding or updating', async () => {
  let now = Date.parse('2026-10-09T12:00:00Z');
  const cart = createCartStore({ mock: true, storage: null, now: () => now });
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
  const cart = createCartStore({ mock: true, storage: memoryStorage({ kafe_cart_mock: '{"broken":true}' }) });
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
  const cart = createCartStore({
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
  const cart = createCartStore({
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
