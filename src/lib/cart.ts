/** Browser cart: demo storage or Shopify's hosted checkout. */
import { storefront } from './shopify/client';
import { CART_CREATE, CART_LINES_ADD, CART_LINES_REMOVE, CART_LINES_UPDATE, CART_QUERY } from './shopify/queries';
import { normalizeCart } from './shopify/normalize';
import { isMockMode, MERCH_ENABLED, GIFT_CARDS_ENABLED } from './shopify/config';
import { getProduct, isCourse, isRetiredCourse } from './shopify';
import { mockCourses, mockMerch } from './shopify/mock';
import { isFutureCourseDate } from './courseAvailability';
import type { Cart, CartLine, Product } from './shopify/types';

const CART_ID_KEY = 'kafe_cart_id';
const MOCK_CART_KEY = 'kafe_cart_mock';

export interface LineSnapshot {
  merchandiseId: string;
  productTitle: string;
  variantTitle: string;
  productHandle: string;
  imageUrl?: string;
  amount: string;
  currencyCode: string;
  quantityAvailable?: number | null;
  /** Stored after authoritative catalog resolution; never trusted as an input claim. */
  isGiftCard?: boolean;
  /** Present only for course lines; a missing course date is not bookable. */
  startsAt?: string | null;
}

export interface CartState {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  open: boolean;
}

type Listener = (state: CartState) => void;
interface MockLineRecord extends LineSnapshot { quantity: number }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface CartOptions {
  mock?: boolean;
  merchEnabled?: boolean;
  giftCardsEnabled?: boolean;
  demoProducts?: () => Product[];
  lookupProduct?: typeof getProduct;
  demoCourses?: () => Product[];
  request?: typeof storefront;
  storage?: StorageLike | null;
  now?: () => number;
  navigate?: (url: string) => void;
}
type Payload = {
  cart?: Record<string, any> | null;
  userErrors?: { message: string }[];
  warnings?: { message: string }[];
};

/** Isolated stores also let tests exercise real API failures without a live shop. */
export function createCartStore(options: CartOptions = {}) {
  const mock = options.mock ?? isMockMode;
  const merchEnabled = options.merchEnabled ?? MERCH_ENABLED;
  const giftCardsEnabled = options.giftCardsEnabled ?? GIFT_CARDS_ENABLED;
  const lookupProduct = options.lookupProduct ?? getProduct;
  const request = options.request ?? storefront;
  const now = options.now ?? Date.now;
  const state: CartState = { cart: null, loading: false, error: null, notice: null, open: false };
  const listeners = new Set<Listener>();
  let records: MockLineRecord[] | undefined;
  let cartId: string | null | undefined;
  let pending = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let initialized: Promise<boolean> | undefined;

  const emit = () => listeners.forEach((listener) => listener({ ...state }));
  const getState = (): CartState => ({ ...state });
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    listener(getState());
    return () => { listeners.delete(listener); };
  };
  const openCart = () => { state.open = true; emit(); };
  const closeCart = () => { state.open = false; emit(); };
  const toggleCart = () => { state.open = !state.open; emit(); };
  const storage = () => options.storage === undefined ? globalThis.localStorage : options.storage;
  const language = () => typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'EN' : 'CS';

  function storedCartId() {
    if (cartId !== undefined) return cartId;
    try { cartId = storage()?.getItem(CART_ID_KEY) ?? null; }
    catch { cartId = null; }
    return cartId;
  }

  function storeCartId(id: string | null) {
    cartId = id;
    try {
      if (id) storage()?.setItem(CART_ID_KEY, id);
      else storage()?.removeItem(CART_ID_KEY);
    } catch { /* Keep the active cart in memory when storage is unavailable. */ }
  }

  function stockLimit(snapshot: LineSnapshot) {
    return typeof snapshot.quantityAvailable === 'number' && Number.isFinite(snapshot.quantityAvailable)
      ? Math.max(0, Math.min(99, Math.floor(snapshot.quantityAvailable))) : 99;
  }

  function validateQuantity(quantity: number, allowZero = false) {
    if (!Number.isInteger(quantity) || quantity < (allowZero ? 0 : 1) || quantity > 99) {
      throw new Error('Choose a whole quantity between 1 and 99.');
    }
  }

  function validateDate(snapshot: LineSnapshot) {
    if ('startsAt' in snapshot && !isFutureCourseDate(snapshot.startsAt, now())) {
      throw new Error('This course date is no longer available. Please choose another date.');
    }
  }

  function resolveDemoSnapshot(snapshot: LineSnapshot): LineSnapshot {
    if (isRetiredCourse(snapshot.productHandle)) throw new Error('This course is no longer available. Please choose another course.');
    const lang = language() === 'EN' ? 'en' : 'cs';
    const products = options.demoProducts?.() ?? [...(options.demoCourses?.() ?? mockCourses(lang)), ...mockMerch(lang)];
    const product = products.find((item) => item.handle === snapshot.productHandle &&
      item.variants.some((variant) => variant.id === snapshot.merchandiseId));
    if (!product) throw new Error('This item is no longer available. Please choose a current course or gift card.');
    const course = isCourse(product);
    if (product.isGiftCard ? !giftCardsEnabled : !course && !merchEnabled) {
      throw new Error(product.isGiftCard ? 'Gift cards are temporarily unavailable.' : 'Merchandise is temporarily unavailable. Please choose a course or gift card.');
    }
    const variant = product.variants.find((item) => item.id === snapshot.merchandiseId)!;
    const capacity = course ? product.course?.capacity : null;
    const stock = !variant.availableForSale ? 0 : product.isGiftCard ? 99
      : stockLimit({ ...snapshot, quantityAvailable: variant.quantityAvailable });
    const limit = typeof capacity === 'number' && Number.isFinite(capacity)
      ? Math.min(stock, Math.max(0, Math.floor(capacity))) : stock;
    const { startsAt: selectedDate, ...withoutDate } = snapshot;
    return {
      ...withoutDate, productTitle: product.title, amount: variant.price.amount,
      variantTitle: course ? snapshot.variantTitle : variant.title,
      currencyCode: variant.price.currencyCode, quantityAvailable: limit, isGiftCard: product.isGiftCard,
      // Preserve course dates; neither gift cards nor physical goods carry a course marker.
      ...(course ? { startsAt: selectedDate ?? null } : {}),
    };
  }

  function readMockLines(): MockLineRecord[] {
    if (!records) {
      records = [];
      try {
        const parsed: unknown = JSON.parse(storage()?.getItem(MOCK_CART_KEY) ?? '[]');
        if (Array.isArray(parsed)) {
          records = parsed.filter((line): line is MockLineRecord =>
            line && ['merchandiseId', 'productTitle', 'variantTitle', 'productHandle', 'amount', 'currencyCode']
              .every((key) => typeof line[key] === 'string') &&
            Number.isFinite(Number(line.amount)) && Number(line.amount) >= 0 &&
            Number.isInteger(line.quantity) && line.quantity > 0,
          );
        }
      } catch { /* A damaged/blocked storage area starts a fresh session cart. */ }
    }
    const refreshed = records.flatMap((line) => {
      try {
        const current = resolveDemoSnapshot(line);
        validateDate(current);
        const quantity = Math.min(line.quantity, stockLimit(current));
        return quantity > 0 ? [{ ...current, quantity }] : [];
      } catch { return []; }
    });
    if (JSON.stringify(records) !== JSON.stringify(refreshed)) {
      state.notice = 'Your saved cart was updated to match current items, prices and availability.';
    }
    records = refreshed;
    return records;
  }

  function saveMockLines(lines: MockLineRecord[]) {
    records = lines;
    try { storage()?.setItem(MOCK_CART_KEY, JSON.stringify(lines)); }
    catch { /* records remains available for this page session. */ }
    const cartLines: CartLine[] = lines.map((line) => ({
      id: `mock-line-${line.merchandiseId}`,
      quantity: line.quantity,
      merchandiseId: line.merchandiseId,
      productTitle: line.productTitle,
      variantTitle: line.variantTitle,
      productHandle: line.productHandle,
      isGiftCard: line.isGiftCard === true,
      ...('startsAt' in line ? { courseStartsAt: line.startsAt } : {}),
      image: line.imageUrl ? { url: line.imageUrl, altText: line.productTitle, width: null, height: null } : null,
      unitPrice: { amount: line.amount, currencyCode: line.currencyCode },
      totalAmount: { amount: (Number(line.amount) * line.quantity).toFixed(2), currencyCode: line.currencyCode },
    }));
    state.cart = {
      id: 'mock-cart', checkoutUrl: '', lines: cartLines,
      totalQuantity: cartLines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: {
        amount: cartLines.reduce((sum, line) => sum + Number(line.totalAmount.amount), 0).toFixed(2),
        currencyCode: cartLines[0]?.totalAmount.currencyCode ?? 'CZK',
      },
    };
  }

  /** One queue covers initialization and mutations; no lost creates or stale responses. */
  function runOperation(operation: () => Promise<void> | void, showCart = false): Promise<boolean> {
    pending += 1;
    state.loading = true;
    emit();
    const result = queue.then(async () => {
      state.error = null;
      state.notice = null;
      try {
        await operation();
        return true;
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Cart operation failed. Please try again.';
        return false;
      } finally {
        if (showCart) state.open = true;
        pending -= 1;
        state.loading = pending > 0;
        emit();
      }
    });
    queue = result;
    return result;
  }

  async function acceptCart(payload: Payload | undefined): Promise<boolean> {
    const error = payload?.userErrors?.[0]?.message;
    if (error) throw new Error(error);
    if (!payload?.cart) throw new Error('Your cart is unavailable. Please refresh and try again.');
    let cart = normalizeCart(payload.cart);
    let removedUnavailable = false;
    const unavailable = (line: CartLine) => isRetiredCourse(line.productHandle) ||
      (line.isGiftCard ? !giftCardsEnabled : !merchEnabled && !('courseStartsAt' in line));
    const hidden = cart.lines.filter(unavailable);
    if (hidden.length) {
      // Do not expose a checkout URL until Shopify confirms the removal.
      state.cart = null;
      storeCartId(cart.id);
      try {
        const data = await request<any>(CART_LINES_REMOVE, {
          cartId: cart.id, lineIds: hidden.map((line) => line.id), language: language(),
        });
        const result: Payload | undefined = data?.cartLinesRemove;
        const removalError = result?.userErrors?.[0]?.message;
        if (removalError || !result?.cart) throw new Error(removalError || 'Shopify did not return the updated cart.');
        cart = normalizeCart(result.cart);
        if (cart.lines.some(unavailable)) {
          throw new Error('Shopify still returned unavailable items in the cart.');
        }
        removedUnavailable = true;
      } catch {
        throw new Error('Some items are no longer available. Your saved cart could not be updated, so checkout is blocked. Please try again.');
      }
    }
    state.cart = cart;
    storeCartId(cart.id);
    state.notice = [
      removedUnavailable ? 'Unavailable items were removed from your cart.' : '',
      ...(payload.warnings?.map((warning) => warning.message) ?? []),
    ].filter(Boolean).join(' ') || null;
    return removedUnavailable;
  }

  async function create(lines: { merchandiseId: string; quantity: number }[]) {
    const data = await request<any>(CART_CREATE, { lines, language: language() });
    await acceptCart(data?.cartCreate);
  }

  function initCart(): Promise<boolean> {
    return initialized ??= runOperation(async () => {
      if (mock) { saveMockLines(readMockLines()); return; }
      const id = storedCartId();
      if (!id) return;
      const data = await request<any>(CART_QUERY, { id, language: language() });
      if (data?.cart) await acceptCart({ cart: data.cart });
      else { storeCartId(null); state.cart = null; }
    });
  }

  async function liveItemLimit(merchandiseId: string, productHandle: string, startsAt?: string | null) {
    if (isRetiredCourse(productHandle)) throw new Error('This course is no longer available. Please choose another course.');
    const product = await lookupProduct(productHandle, language() === 'EN' ? 'en' : 'cs');
    const variant = product?.variants.find((item) => item.id === merchandiseId);
    if (!product || !variant || isRetiredCourse(product.handle)) throw new Error('This item is no longer available. Please remove it and choose another item.');
    const course = isCourse(product);
    if (product.isGiftCard ? !giftCardsEnabled : !course && !merchEnabled) {
      throw new Error(product.isGiftCard ? 'Gift cards are temporarily unavailable.' : 'Merchandise is temporarily unavailable. Please choose a course or gift card.');
    }
    if (!variant.availableForSale) throw new Error('This item is currently sold out.');
    const stock = product.isGiftCard ? 99 : stockLimit({ merchandiseId, productHandle, productTitle: '', variantTitle: '', amount: '0', currencyCode: '', quantityAvailable: variant.quantityAvailable });
    if (!course) return { limit: stock, course: false };
    if (!isFutureCourseDate(variant.startsAt, now())) {
      throw new Error('This course date is no longer available. Please remove it and choose another date.');
    }
    if (!startsAt || Date.parse(variant.startsAt) !== Date.parse(startsAt)) {
      throw new Error('This course date has changed. Please remove it and choose the current date.');
    }
    const capacity = product.course?.capacity;
    return {
      course: true,
      limit: typeof capacity === 'number' && Number.isFinite(capacity)
        ? Math.min(stock, Math.max(0, Math.floor(capacity))) : stock,
    };
  }

  function addLine(snapshot: LineSnapshot, quantity = 1): Promise<boolean> {
    return runOperation(async () => {
      validateQuantity(quantity);
      if (mock) {
        snapshot = resolveDemoSnapshot(snapshot);
        validateDate(snapshot);
        const lines = readMockLines();
        const existing = lines.find((line) => line.merchandiseId === snapshot.merchandiseId);
        const nextQuantity = (existing?.quantity ?? 0) + quantity;
        if (nextQuantity > stockLimit(snapshot)) {
          throw new Error(`Only ${stockLimit(snapshot)} can be added to this cart.`);
        }
        if (existing) Object.assign(existing, snapshot, { quantity: nextQuantity });
        else lines.push({ ...snapshot, quantity });
        saveMockLines(lines);
        return;
      }
      const available = await liveItemLimit(snapshot.merchandiseId, snapshot.productHandle, snapshot.startsAt);
      const existingQuantity = state.cart?.lines.filter((line) => line.merchandiseId === snapshot.merchandiseId)
        .reduce((sum, line) => sum + line.quantity, 0) ?? 0;
      if (existingQuantity + quantity > available.limit) {
        throw new Error(available.course
          ? `Only ${available.limit} seats can be added to this course date.`
          : `Only ${available.limit} of this item can be added to the cart.`);
      }
      const id = storedCartId();
      const lines = [{ merchandiseId: snapshot.merchandiseId, quantity }];
      const previousQuantity = state.cart?.lines.find((line) => line.merchandiseId === snapshot.merchandiseId)?.quantity ?? 0;
      let created = !id;
      if (!id) await create(lines);
      else {
        const data = await request<any>(CART_LINES_ADD, { cartId: id, lines, language: language() });
        const payload: Payload | undefined = data?.cartLinesAdd;
        if (!payload?.cart) {
          // Expiration can arrive with userErrors. Confirm it before retrying.
          const current = await request<any>(CART_QUERY, { id, language: language() });
          if (current?.cart) await acceptCart(payload);
          else {
            storeCartId(null);
            state.cart = null;
            await create(lines);
            created = true;
          }
        } else await acceptCart(payload);
      }
      const addedCourse = state.cart?.lines.find((line) => line.merchandiseId === snapshot.merchandiseId);
      if (addedCourse && 'courseStartsAt' in addedCourse && !isFutureCourseDate(addedCourse.courseStartsAt, now())) {
        throw new Error('This course date is no longer available. Please remove it and choose another date.');
      }
      const addedQuantity = state.cart?.lines.find((line) => line.merchandiseId === snapshot.merchandiseId)?.quantity ?? 0;
      if (addedQuantity <= (created ? 0 : previousQuantity)) {
        throw new Error(state.notice || 'This item could not be added. Please check its availability.');
      }
    }, true);
  }

  function updateLine(lineId: string, quantity: number): Promise<boolean> {
    if (quantity === 0) return removeLine(lineId);
    return runOperation(async () => {
      validateQuantity(quantity);
      if (mock) {
        const lines = readMockLines();
        const record = lines.find((line) => `mock-line-${line.merchandiseId}` === lineId);
        if (!record) throw new Error('This item is no longer in your cart.');
        validateDate(record);
        if (quantity > stockLimit(record)) throw new Error(`Only ${stockLimit(record)} can be added to this cart.`);
        record.quantity = quantity;
        saveMockLines(lines);
        return;
      }
      const line = state.cart?.lines.find((item) => item.id === lineId);
      if (!line) throw new Error('This item is no longer in your cart.');
      if ('courseStartsAt' in line && !isFutureCourseDate(line.courseStartsAt, now())) {
        throw new Error('This course date is no longer available. Please remove it and choose another date.');
      }
      const available = await liveItemLimit(line.merchandiseId, line.productHandle, line.courseStartsAt);
      const otherQuantity = state.cart?.lines.filter((item) => item.id !== lineId && item.merchandiseId === line.merchandiseId)
        .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      if (quantity + otherQuantity > available.limit && quantity >= line.quantity) {
        throw new Error(available.course
          ? `Only ${available.limit} seats are available. Please reduce the quantity or remove this date.`
          : `Only ${available.limit} of this item are available. Please reduce the quantity.`);
      }
      const id = storedCartId();
      if (!id) throw new Error('Your cart has expired. Please add the item again.');
      const data = await request<any>(CART_LINES_UPDATE, { cartId: id, lines: [{ id: lineId, quantity }], language: language() });
      await acceptCart(data?.cartLinesUpdate);
    });
  }

  function removeLine(lineId: string): Promise<boolean> {
    return runOperation(async () => {
      if (mock) {
        saveMockLines(readMockLines().filter((line) => `mock-line-${line.merchandiseId}` !== lineId));
        return;
      }
      const id = storedCartId();
      if (!id) throw new Error('Your cart has expired. Please add the item again.');
      const data = await request<any>(CART_LINES_REMOVE, { cartId: id, lineIds: [lineId], language: language() });
      await acceptCart(data?.cartLinesRemove);
    });
  }

  async function checkout(): Promise<boolean> {
    if (mock || state.loading || !state.cart?.checkoutUrl || !state.cart.lines.length) return false;
    return runOperation(async () => {
      const id = storedCartId();
      if (!id) throw new Error('Your cart has expired. Please add the items again.');
      const data = await request<any>(CART_QUERY, { id, language: language() });
      if (!data?.cart) {
        storeCartId(null);
        state.cart = null;
        throw new Error('Your cart has expired. Please add the items again.');
      }
      const removedUnavailable = await acceptCart({ cart: data.cart });
      if (removedUnavailable) throw new Error('Unavailable items were removed from your cart. Please review your cart before continuing to checkout.');
      if (!state.cart?.lines.length) throw new Error('Your cart is empty. Please add an item first.');
      for (const line of state.cart.lines) {
        if ('courseStartsAt' in line && !isFutureCourseDate(line.courseStartsAt, now())) {
          throw new Error('A course in your cart is no longer available. Please remove it and choose another date.');
        }
        const available = await liveItemLimit(line.merchandiseId, line.productHandle, line.courseStartsAt);
        const totalQuantity = state.cart.lines.filter((item) => item.merchandiseId === line.merchandiseId)
          .reduce((sum, item) => sum + item.quantity, 0);
        if (totalQuantity > available.limit) {
          throw new Error(available.course
            ? `Only ${available.limit} seats remain for a course in your cart. Please reduce its quantity before checkout.`
            : `Only ${available.limit} of an item in your cart remain available. Please reduce its quantity before checkout.`);
        }
      }
      const url = state.cart.checkoutUrl;
      if (!url || new URL(url).protocol !== 'https:') throw new Error('Checkout is unavailable. Please try again.');
      if (options.navigate) options.navigate(url);
      else window.location.href = url;
    }, true);
  }

  return { subscribe, getState, openCart, closeCart, toggleCart, initCart, addLine, updateLine, removeLine, checkout };
}

export const { subscribe, getState, openCart, closeCart, toggleCart, initCart, addLine, updateLine, removeLine, checkout } = createCartStore();
export { isMockMode };
