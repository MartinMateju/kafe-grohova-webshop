import { storefront, ShopifyError } from './client';
import {
  ALL_PRODUCTS_QUERY,
  ARTICLE_QUERY,
  ARTICLES_QUERY,
  COLLECTION_QUERY,
  PRODUCT_QUERY,
  PRODUCT_VARIANTS_QUERY,
} from './queries';
import { normalizeArticle, normalizeProduct } from './normalize';
import { mockArticles, mockCourses, mockMerch } from './mock';
import {
  BLOG_HANDLE,
  COURSES_COLLECTION,
  MERCH_COLLECTION,
  MERCH_ENABLED,
  GIFT_CARDS_ENABLED,
  isMockMode,
} from './config';
import type { Article, Product } from './types';
import { shopifyLanguage, type Lang } from '../../i18n/utils';
import { isFutureCourseDate } from '../courseAvailability';

export * from './types';
export { isMockMode, MERCH_ENABLED, GIFT_CARDS_ENABLED } from './config';

// Cupping replaced this course; keep earlier Shopify imports out of the storefront.
const RETIRED_COURSE_HANDLES = new Set(['espresso-zaklady']);
export function isRetiredCourse(handle: string): boolean {
  return RETIRED_COURSE_HANDLES.has(handle);
}

type Raw = Record<string, any>;
interface Connection {
  nodes: Raw[];
  pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
}

/** Exhaust connections so a static build creates every product/article route. */
async function readConnection(
  query: string,
  variables: Record<string, unknown>,
  select: (data: Raw) => Connection | null | undefined,
): Promise<Raw[] | null> {
  const nodes: Raw[] = [];
  let after: string | null = null;
  const seen = new Set<string>();
  while (true) {
    const data = await storefront<Raw>(query, { ...variables, after });
    const connection = select(data);
    if (!connection) {
      if (after) throw new ShopifyError('Shopify content disappeared while reading a later page. Please retry the build.');
      return null;
    }
    nodes.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) return nodes;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || seen.has(cursor)) {
      throw new ShopifyError('Shopify returned an invalid pagination cursor.');
    }
    seen.add(cursor);
    after = cursor;
  }
}

async function completeProduct(raw: Raw, lang: Lang): Promise<Product> {
  if (raw.variants?.pageInfo?.hasNextPage) {
    const variants = await readConnection(
      PRODUCT_VARIANTS_QUERY,
      { handle: raw.handle, language: shopifyLanguage(lang) },
      (data) => data.product?.variants,
    );
    if (!variants) throw new ShopifyError(`Product ${raw.handle} disappeared while reading its variants.`);
    return normalizeProduct({ ...raw, variants: { nodes: variants } });
  }
  return normalizeProduct(raw);
}

/** Barista course products — one variant per scheduled date. */
export async function getCourses(lang: Lang): Promise<Product[]> {
  if (isMockMode) return mockCourses(lang).filter((product) => !isRetiredCourse(product.handle) && isCourse(product));

  const nodes = await readConnection(
    COLLECTION_QUERY,
    {
      handle: COURSES_COLLECTION,
      first: 20,
      language: shopifyLanguage(lang),
    },
    (data) => data.collection?.products,
  );
  if (!nodes) {
    throw new ShopifyError(`The courses collection "${COURSES_COLLECTION}" is missing or not published to the Headless channel.`);
  }
  const products = await Promise.all(nodes
    .filter((raw) => !isRetiredCourse(raw.handle))
    .map((raw) => completeProduct(raw, lang)));
  return products.filter(isCourse);
}

/** Merchandise products. Falls back to all products if the collection is absent. */
export async function getMerch(lang: Lang): Promise<Product[]> {
  if (!MERCH_ENABLED) return [];
  if (isMockMode) return mockMerch(lang).filter((product) => !product.isGiftCard && !isCourse(product));

  const nodes = await readConnection(
    COLLECTION_QUERY,
    {
      handle: MERCH_COLLECTION,
      first: 20,
      language: shopifyLanguage(lang),
    },
    (data) => data.collection?.products,
  );

  // An intentionally empty collection is not the same as a missing collection.
  if (nodes) {
    const products = await Promise.all(nodes.map((raw) => completeProduct(raw, lang)));
    return products.filter((product) => !product.isGiftCard && !isCourse(product));
  }

  const all = await readConnection(
    ALL_PRODUCTS_QUERY,
    { first: 20, language: shopifyLanguage(lang) },
    (data) => data.products,
  );
  const allNodes = await Promise.all((all ?? []).map((raw) => completeProduct(raw, lang)));
  // Keep courses out of the merch grid even when no collections are set up.
  return allNodes.filter((product) => !product.isGiftCard && !isCourse(product));
}

/** Native Shopify gift cards have independent visibility from physical merchandise. */
export async function getGiftCards(lang: Lang): Promise<Product[]> {
  if (!GIFT_CARDS_ENABLED) return [];
  if (isMockMode) return [...mockMerch(lang), ...mockCourses(lang)].filter((product) => product.isGiftCard);
  // Storefront product search has no documented native gift-card filter.
  const nodes = await readConnection(
    ALL_PRODUCTS_QUERY,
    { first: 20, language: shopifyLanguage(lang) },
    (data) => data.products,
  );
  return Promise.all((nodes ?? []).filter((raw) => raw.isGiftCard === true)
    .map((raw) => completeProduct(raw, lang)));
}

function productEnabled(product: Product): boolean {
  return product.isGiftCard ? GIFT_CARDS_ENABLED : isCourse(product) || MERCH_ENABLED;
}

export async function getProduct(
  handle: string,
  lang: Lang,
): Promise<Product | null> {
  if (isRetiredCourse(handle)) return null;
  if (isMockMode) {
    return (
      [...mockMerch(lang), ...mockCourses(lang)].find(
        (product) => product.handle === handle && productEnabled(product),
      ) ?? null
    );
  }

  const data = await storefront<Raw>(
    PRODUCT_QUERY,
    { handle, language: shopifyLanguage(lang) },
  );
  if (!data?.product || isRetiredCourse(data.product.handle)) return null;
  const product = await completeProduct(data.product, lang);
  return productEnabled(product) ? product : null;
}

export async function getArticles(lang: Lang): Promise<Article[]> {
  if (isMockMode) return mockArticles(lang);

  const nodes = await readConnection(
    ARTICLES_QUERY,
    {
      handle: BLOG_HANDLE,
      first: 30,
      language: shopifyLanguage(lang),
    },
    (data) => data.blog?.articles,
  );
  return (nodes ?? []).map(normalizeArticle);
}

export async function getArticle(
  handle: string,
  lang: Lang,
): Promise<Article | null> {
  if (isMockMode) {
    return mockArticles(lang).find((a) => a.handle === handle) ?? null;
  }

  const data = await storefront<Raw>(
    ARTICLE_QUERY,
    {
      blogHandle: BLOG_HANDLE,
      handle,
      language: shopifyLanguage(lang),
    },
  );
  const raw = data?.blog?.articleByHandle;
  return raw ? normalizeArticle(raw) : null;
}

/* --------------------------------------------------------------- helpers -- */

/** A product counts as a course when it is typed, tagged or metafielded as one. */
export function isCourse(product: Product): boolean {
  if (product.isGiftCard) return false;
  return (
    product.course !== null ||
    product.productType.toLowerCase() === 'course' ||
    product.tags.some((t) => t.toLowerCase() === 'course') ||
    product.variants.some((variant) => Boolean(variant.startsAt))
  );
}

/** Total seats still bookable across every date of a course. */
export function seatsRemaining(product: Product): number | null {
  const counts = bookableVariants(product).map((v) => v.quantityAvailable);
  if (counts.some((quantity) => quantity === null)) return null;
  return counts.reduce<number>((total, quantity) => total + (quantity ?? 0), 0);
}

/** Variants that still have a seat, sorted by start date when available. */
export function bookableVariants(product: Product, now = Date.now()) {
  const capacity = product.course?.capacity;
  const limit = typeof capacity === 'number' && Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : null;
  return product.variants
    .map((variant) => limit === null ? variant : {
      ...variant,
      quantityAvailable: limit === 0 ? 0 : variant.quantityAvailable === null ? null : Math.min(variant.quantityAvailable, limit),
    })
    .filter((v) => v.availableForSale &&
      (v.quantityAvailable === null || v.quantityAvailable > 0) &&
      isFutureCourseDate(v.startsAt, now))
    .sort((a, b) => {
      if (a.startsAt && b.startsAt) {
        return Date.parse(a.startsAt) - Date.parse(b.startsAt);
      }
      return 0;
    });
}

export function formatMoney(
  money: { amount: string; currencyCode: string } | null | undefined,
  lang: Lang,
): string {
  if (!money) return '';
  const amount = Number.parseFloat(money.amount);
  if (!Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
      style: 'currency',
      currency: money.currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${money.currencyCode}`;
  }
}

export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDuration(minutes: number | null, lang: Lang): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hUnit = lang === 'cs' ? 'h' : 'h';
  const mUnit = 'min';
  if (h && m) return `${h} ${hUnit} ${m} ${mUnit}`;
  if (h) return `${h} ${hUnit}`;
  return `${m} ${mUnit}`;
}

/**
 * Shopify CDN images accept width/height/crop params. Local fixture paths are
 * returned untouched so mock mode works without a CDN.
 */
export function imageUrl(
  url: string | null | undefined,
  width: number,
  height?: number,
): string {
  if (!url) return '';
  if (!url.includes('cdn.shopify.com')) return url;
  const u = new URL(url);
  u.searchParams.set('width', String(width));
  if (height) {
    u.searchParams.set('height', String(height));
    u.searchParams.set('crop', 'center');
  }
  return u.toString();
}
