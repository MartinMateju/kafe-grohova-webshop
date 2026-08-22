/**
 * Browser-side cart.
 *
 * Real mode talks to the Shopify Storefront Cart API and hands the customer
 * over to Shopify's hosted checkout. Mock mode keeps an equivalent structure
 * in localStorage so the whole flow — add, update, remove, subtotal — can be
 * exercised before a store exists; only the final redirect is disabled.
 */
import { storefront } from './shopify/client';
import {
  CART_CREATE,
  CART_LINES_ADD,
  CART_LINES_REMOVE,
  CART_LINES_UPDATE,
  CART_QUERY,
} from './shopify/queries';
import { normalizeCart } from './shopify/normalize';
import { isMockMode } from './shopify/config';
import type { Cart, CartLine } from './shopify/types';

const CART_ID_KEY = 'kafe_cart_id';
const MOCK_CART_KEY = 'kafe_cart_mock';

/** Snapshot passed from the add-to-cart button so mock mode can render lines. */
export interface LineSnapshot {
  merchandiseId: string;
  productTitle: string;
  variantTitle: string;
  productHandle: string;
  imageUrl?: string;
  amount: string;
  currencyCode: string;
}

export interface CartState {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  open: boolean;
}

type Listener = (state: CartState) => void;

const state: CartState = {
  cart: null,
  loading: false,
  error: null,
  open: false,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener({ ...state });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getState(): CartState {
  return { ...state };
}

export function openCart() {
  state.open = true;
  emit();
}

export function closeCart() {
  state.open = false;
  emit();
}

export function toggleCart() {
  state.open = !state.open;
  emit();
}

/* ------------------------------------------------------------- mock cart -- */

interface MockLineRecord extends LineSnapshot {
  quantity: number;
}

function readMockLines(): MockLineRecord[] {
  try {
    const raw = localStorage.getItem(MOCK_CART_KEY);
    return raw ? (JSON.parse(raw) as MockLineRecord[]) : [];
  } catch {
    return [];
  }
}

function writeMockLines(lines: MockLineRecord[]) {
  try {
    localStorage.setItem(MOCK_CART_KEY, JSON.stringify(lines));
  } catch {
    /* private browsing — cart is session-only, which is acceptable in demo mode */
  }
}

function buildMockCart(records: MockLineRecord[]): Cart {
  const lines: CartLine[] = records.map((r, i) => {
    const unit = Number.parseFloat(r.amount) || 0;
    return {
      id: `mock-line-${i}-${r.merchandiseId}`,
      quantity: r.quantity,
      merchandiseId: r.merchandiseId,
      productTitle: r.productTitle,
      variantTitle: r.variantTitle,
      productHandle: r.productHandle,
      image: r.imageUrl
        ? { url: r.imageUrl, altText: r.productTitle, width: null, height: null }
        : null,
      unitPrice: { amount: r.amount, currencyCode: r.currencyCode },
      totalAmount: {
        amount: (unit * r.quantity).toFixed(2),
        currencyCode: r.currencyCode,
      },
    };
  });

  const subtotalAmount = lines.reduce(
    (sum, l) => sum + Number.parseFloat(l.totalAmount.amount),
    0,
  );

  return {
    id: 'mock-cart',
    checkoutUrl: '',
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: {
      amount: subtotalAmount.toFixed(2),
      currencyCode: lines[0]?.totalAmount.currencyCode ?? 'CZK',
    },
    lines,
  };
}

function refreshMock() {
  state.cart = buildMockCart(readMockLines());
  state.error = null;
  emit();
}

/* ------------------------------------------------------------- real cart -- */

function storedCartId(): string | null {
  try {
    return localStorage.getItem(CART_ID_KEY);
  } catch {
    return null;
  }
}

function storeCartId(id: string | null) {
  try {
    if (id) localStorage.setItem(CART_ID_KEY, id);
    else localStorage.removeItem(CART_ID_KEY);
  } catch {
    /* ignore */
  }
}

function firstUserError(payload: any): string | null {
  const errors = payload?.userErrors;
  if (Array.isArray(errors) && errors.length) return errors[0].message;
  return null;
}

async function withLoading<T>(fn: () => Promise<T>): Promise<T | null> {
  state.loading = true;
  state.error = null;
  emit();
  try {
    return await fn();
  } catch (error) {
    state.error =
      error instanceof Error ? error.message : 'Cart operation failed';
    return null;
  } finally {
    state.loading = false;
    emit();
  }
}

/** Load an existing cart from Shopify, or the mock cart, on page load. */
export async function initCart(): Promise<void> {
  if (isMockMode) {
    refreshMock();
    return;
  }

  const id = storedCartId();
  if (!id) return;

  await withLoading(async () => {
    const data = await storefront<any>(CART_QUERY, { id });
    if (data?.cart) {
      state.cart = normalizeCart(data.cart);
    } else {
      // Cart expired or was completed — start clean.
      storeCartId(null);
      state.cart = null;
    }
  });
}

export async function addLine(
  snapshot: LineSnapshot,
  quantity = 1,
): Promise<void> {
  if (isMockMode) {
    const lines = readMockLines();
    const existing = lines.find(
      (l) => l.merchandiseId === snapshot.merchandiseId,
    );
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else lines.push({ ...snapshot, quantity });
    writeMockLines(lines);
    refreshMock();
    openCart();
    return;
  }

  await withLoading(async () => {
    const id = storedCartId();
    const lineInput = [{ merchandiseId: snapshot.merchandiseId, quantity }];

    if (!id) {
      const data = await storefront<any>(CART_CREATE, { lines: lineInput });
      const error = firstUserError(data?.cartCreate);
      if (error) throw new Error(error);
      const cart = data?.cartCreate?.cart;
      if (!cart) throw new Error('Could not create cart');
      storeCartId(cart.id);
      state.cart = normalizeCart(cart);
    } else {
      const data = await storefront<any>(CART_LINES_ADD, {
        cartId: id,
        lines: lineInput,
      });
      const error = firstUserError(data?.cartLinesAdd);
      if (error) throw new Error(error);
      const cart = data?.cartLinesAdd?.cart;
      if (!cart) {
        // Cart went stale — drop it and retry once as a fresh cart.
        storeCartId(null);
        const retry = await storefront<any>(CART_CREATE, { lines: lineInput });
        const retryCart = retry?.cartCreate?.cart;
        if (!retryCart) throw new Error('Could not add to cart');
        storeCartId(retryCart.id);
        state.cart = normalizeCart(retryCart);
      } else {
        state.cart = normalizeCart(cart);
      }
    }
  });

  openCart();
}

export async function updateLine(
  lineId: string,
  quantity: number,
): Promise<void> {
  if (quantity < 1) return removeLine(lineId);

  if (isMockMode) {
    const lines = readMockLines();
    const index = Number.parseInt(lineId.split('-')[2] ?? '', 10);
    const record = Number.isFinite(index)
      ? lines[index]
      : lines.find((l) => lineId.includes(l.merchandiseId));
    if (record) record.quantity = Math.min(99, quantity);
    writeMockLines(lines);
    refreshMock();
    return;
  }

  const id = storedCartId();
  if (!id) return;

  await withLoading(async () => {
    const data = await storefront<any>(CART_LINES_UPDATE, {
      cartId: id,
      lines: [{ id: lineId, quantity }],
    });
    const error = firstUserError(data?.cartLinesUpdate);
    if (error) throw new Error(error);
    if (data?.cartLinesUpdate?.cart) {
      state.cart = normalizeCart(data.cartLinesUpdate.cart);
    }
  });
}

export async function removeLine(lineId: string): Promise<void> {
  if (isMockMode) {
    const lines = readMockLines();
    const filtered = lines.filter((l) => !lineId.includes(l.merchandiseId));
    writeMockLines(filtered);
    refreshMock();
    return;
  }

  const id = storedCartId();
  if (!id) return;

  await withLoading(async () => {
    const data = await storefront<any>(CART_LINES_REMOVE, {
      cartId: id,
      lineIds: [lineId],
    });
    const error = firstUserError(data?.cartLinesRemove);
    if (error) throw new Error(error);
    if (data?.cartLinesRemove?.cart) {
      state.cart = normalizeCart(data.cartLinesRemove.cart);
    }
  });
}

/** Hand off to Shopify's hosted checkout. No-op in mock mode. */
export function checkout(): boolean {
  const url = state.cart?.checkoutUrl;
  if (!url) return false;
  window.location.href = url;
  return true;
}

export { isMockMode };
