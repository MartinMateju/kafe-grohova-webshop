import type { Product, Variant } from './shopify/types';
import { isFutureCourseDate } from './courseAvailability';

type Identity = Pick<Product, 'handle' | 'tags' | 'isGiftCard'>;
const PREPARING = new Set(['cupping', 'senzorika', 'sensory', 'sensory-skills', 'filtrovana-kava', 'filter']);
export const LATTE_ART_START = '2026-11-25T16:00:00.000Z';
export const LATTE_ART_PRICE_CZK = 2100;

/** Confirmed launch session: 25 November, 17:00 in Prague, 2.5 hours. */
export function isLaunchCourseVariant(product: Identity, variant: Variant): boolean {
  return !isLatteArtCourse(product) || (Date.parse(variant.startsAt ?? '') === Date.parse(LATTE_ART_START) &&
    Date.parse(variant.endsAt ?? '') === Date.parse(LATTE_ART_START) + 150 * 60_000 &&
    variant.price.currencyCode === 'CZK' && Number(variant.price.amount) === LATTE_ART_PRICE_CZK);
}

/** Editorial launch policy; it never rewrites Shopify product or variant data. */
export function isComingSoonCourseHandle(handle: string): boolean {
  return PREPARING.has(handle.toLowerCase());
}

export function isComingSoonCourse(product: Identity): boolean {
  return !product.isGiftCard && !isManualLatteArtGiftCard(product) && (isComingSoonCourseHandle(product.handle) ||
    product.tags.some(tag => PREPARING.has(tag.toLowerCase()) ||
      ['coming-soon', 'course-coming-soon'].includes(tag.toLowerCase())));
}

export function isLatteArtCourse(product: Identity): boolean {
  const tags = product.tags.map(tag => tag.toLowerCase());
  return !product.isGiftCard && !isManualLatteArtGiftCard(product) && (product.handle === 'latte-art' || tags.includes('latte-art') ||
    (tags.includes('milk') && tags.includes('beginner')));
}

/** One actual, future date, with the original Shopify identity and price. */
export function firstBookableCourseVariant(product: Product, now = Date.now()): Variant | null {
  if (isComingSoonCourse(product) || product.isGiftCard || isManualLatteArtGiftCard(product)) return null;
  const capacity = product.course?.capacity;
  if (typeof capacity === 'number' && (!Number.isFinite(capacity) || capacity <= 0)) return null;
  const variant = product.variants.filter(item => isLaunchCourseVariant(product, item) && item.availableForSale &&
    (item.quantityAvailable === null || item.quantityAvailable > 0) &&
    isFutureCourseDate(item.startsAt, now))
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0];
  if (!variant) return null;
  return { ...variant, quantityAvailable: variant.quantityAvailable === null ? null :
    typeof capacity === 'number' ? Math.min(variant.quantityAvailable, Math.floor(capacity)) : variant.quantityAvailable };
}

/** Manual vouchers require an explicit tag; an ordinary product name/handle is insufficient. */
export function isManualLatteArtGiftCard(product: Identity): boolean {
  return !product.isGiftCard && product.tags.some(tag => tag.toLowerCase() === 'course-voucher:latte-art');
}

/** Preserve native gift cards while supporting the studio's designated manual voucher. */
export function isLatteArtGiftCard(product: Identity): boolean {
  return isManualLatteArtGiftCard(product) || (product.isGiftCard && (product.handle === 'poukaz-latte-art' ||
    product.tags.some(tag => tag.toLowerCase() === 'course-voucher:latte-art')));
}

export function resolveLatteArtGiftCard(products: Product[]): Product | null {
  const ordered = [...products.filter(isManualLatteArtGiftCard), ...products.filter(product => !isManualLatteArtGiftCard(product))];
  for (const product of ordered) {
    if (!isLatteArtGiftCard(product)) continue;
    const variants = product.variants.filter(variant => isLatteArtGiftVariant(variant, product));
    if (!variants.some(variant => variant.availableForSale)) continue;
    return { ...product, variants, priceRange: { minVariantPrice: variants[0].price, maxVariantPrice: variants[0].price } };
  }
  return null;
}

export function isLatteArtGiftVariant(variant: Variant, product?: Identity): boolean {
  return variant.price.currencyCode === 'CZK' && Number(variant.price.amount) === LATTE_ART_PRICE_CZK &&
    (!product || !isManualLatteArtGiftCard(product) || variant.requiresShipping === false);
}
