import { storefrontSafe } from './client';
import {
  ALL_PRODUCTS_QUERY,
  ARTICLE_QUERY,
  ARTICLES_QUERY,
  COLLECTION_QUERY,
  PRODUCT_QUERY,
} from './queries';
import { normalizeArticle, normalizeProduct } from './normalize';
import { mockArticles, mockCourses, mockMerch } from './mock';
import {
  BLOG_HANDLE,
  COURSES_COLLECTION,
  MERCH_COLLECTION,
  isMockMode,
} from './config';
import type { Article, Product } from './types';
import { shopifyLanguage, type Lang } from '../../i18n/utils';

export * from './types';
export { isMockMode } from './config';

/** Barista course products — one variant per scheduled date. */
export async function getCourses(lang: Lang): Promise<Product[]> {
  if (isMockMode) return mockCourses(lang);

  const data = await storefrontSafe<any>(
    COLLECTION_QUERY,
    {
      handle: COURSES_COLLECTION,
      first: 50,
      language: shopifyLanguage(lang),
    },
    null,
  );

  const nodes = data?.collection?.products?.nodes ?? [];
  return nodes.map(normalizeProduct);
}

/** Merchandise products. Falls back to all products if the collection is absent. */
export async function getMerch(lang: Lang): Promise<Product[]> {
  if (isMockMode) return mockMerch(lang);

  const data = await storefrontSafe<any>(
    COLLECTION_QUERY,
    {
      handle: MERCH_COLLECTION,
      first: 100,
      language: shopifyLanguage(lang),
    },
    null,
  );

  const nodes = data?.collection?.products?.nodes;
  if (nodes?.length) return nodes.map(normalizeProduct);

  const all = await storefrontSafe<any>(
    ALL_PRODUCTS_QUERY,
    { first: 100, language: shopifyLanguage(lang) },
    null,
  );
  const allNodes: Product[] = (all?.products?.nodes ?? []).map(normalizeProduct);
  // Keep courses out of the merch grid even when no collections are set up.
  return allNodes.filter((p) => !isCourse(p));
}

export async function getProduct(
  handle: string,
  lang: Lang,
): Promise<Product | null> {
  if (isMockMode) {
    return (
      [...mockMerch(lang), ...mockCourses(lang)].find(
        (p) => p.handle === handle,
      ) ?? null
    );
  }

  const data = await storefrontSafe<any>(
    PRODUCT_QUERY,
    { handle, language: shopifyLanguage(lang) },
    null,
  );
  return data?.product ? normalizeProduct(data.product) : null;
}

export async function getArticles(lang: Lang): Promise<Article[]> {
  if (isMockMode) return mockArticles(lang);

  const data = await storefrontSafe<any>(
    ARTICLES_QUERY,
    {
      handle: BLOG_HANDLE,
      first: 30,
      language: shopifyLanguage(lang),
    },
    null,
  );
  return (data?.blog?.articles?.nodes ?? []).map(normalizeArticle);
}

export async function getArticle(
  handle: string,
  lang: Lang,
): Promise<Article | null> {
  if (isMockMode) {
    return mockArticles(lang).find((a) => a.handle === handle) ?? null;
  }

  const data = await storefrontSafe<any>(
    ARTICLE_QUERY,
    {
      blogHandle: BLOG_HANDLE,
      handle,
      language: shopifyLanguage(lang),
    },
    null,
  );
  const raw = data?.blog?.articleByHandle;
  return raw ? normalizeArticle(raw) : null;
}

/* --------------------------------------------------------------- helpers -- */

/** A product counts as a course when it is typed, tagged or metafielded as one. */
export function isCourse(product: Product): boolean {
  return (
    product.course !== null ||
    product.productType.toLowerCase() === 'course' ||
    product.tags.some((t) => t.toLowerCase() === 'course')
  );
}

/** Total seats still bookable across every date of a course. */
export function seatsRemaining(product: Product): number | null {
  const counts = product.variants
    .filter((v) => v.availableForSale)
    .map((v) => v.quantityAvailable)
    .filter((q): q is number => typeof q === 'number');
  if (!counts.length) return null;
  return counts.reduce((a, b) => a + b, 0);
}

/** Variants that still have a seat, sorted by start date when available. */
export function bookableVariants(product: Product) {
  return product.variants
    .filter((v) => v.availableForSale)
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
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
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
