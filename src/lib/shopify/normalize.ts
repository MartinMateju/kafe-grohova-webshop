import type {
  Article,
  Cart,
  CartLine,
  CourseMeta,
  Product,
  ShopImage,
  Variant,
} from './types';
import { isManualLatteArtGiftCard } from '../coursePresentation';
import { VOUCHER_RECIPIENT_KEY, VOUCHER_DEDICATION_KEY } from '../voucherPersonalization';

type Raw = Record<string, any>;

function image(raw: Raw | null | undefined): ShopImage | null {
  if (!raw?.url) return null;
  return {
    url: raw.url,
    altText: raw.altText ?? null,
    width: raw.width ?? null,
    height: raw.height ?? null,
  };
}

function metafieldValue(raw: Raw | null | undefined): string | null {
  const value = raw?.value;
  return typeof value === 'string' && value.length ? value : null;
}

function toInt(value: string | null): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Shopify list metafields arrive as a JSON-encoded array of strings. */
function toStringList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // multi_line_text_field: one item per line
    return value
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeVariant(raw: Raw): Variant {
  return {
    id: raw.id,
    title: raw.title,
    availableForSale: Boolean(raw.availableForSale),
    ...(typeof raw.requiresShipping === 'boolean' ? { requiresShipping: raw.requiresShipping } : {}),
    quantityAvailable:
      typeof raw.quantityAvailable === 'number' ? raw.quantityAvailable : null,
    price: raw.price,
    compareAtPrice: raw.compareAtPrice ?? null,
    selectedOptions: raw.selectedOptions ?? [],
    image: image(raw.image),
    startsAt: metafieldValue(raw.startsAt),
    endsAt: metafieldValue(raw.endsAt),
  };
}

function normalizeCourseMeta(raw: Raw): CourseMeta | null {
  const durationMinutes = toInt(metafieldValue(raw.courseDuration));
  const capacity = toInt(metafieldValue(raw.courseCapacity));
  const level = metafieldValue(raw.courseLevel);
  const syllabus = toStringList(metafieldValue(raw.courseSyllabus));

  if (
    durationMinutes == null &&
    capacity == null &&
    level == null &&
    syllabus.length === 0
  ) {
    return null;
  }
  return { durationMinutes, capacity, level, syllabus };
}

export function normalizeProduct(raw: Raw): Product {
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    description: raw.description ?? '',
    descriptionHtml: raw.descriptionHtml ?? '',
    productType: raw.productType ?? '',
    isGiftCard: raw.isGiftCard === true,
    tags: raw.tags ?? [],
    availableForSale: Boolean(raw.availableForSale),
    featuredImage: image(raw.featuredImage),
    images: (raw.images?.nodes ?? []).map(image).filter(Boolean) as ShopImage[],
    options: raw.options ?? [],
    variants: (raw.variants?.nodes ?? []).map(normalizeVariant),
    priceRange: raw.priceRange,
    course: normalizeCourseMeta(raw),
  };
}

export function normalizeArticle(raw: Raw): Article {
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    excerpt: raw.excerpt ?? '',
    excerptHtml: raw.excerptHtml ?? '',
    contentHtml: raw.contentHtml ?? '',
    publishedAt: raw.publishedAt,
    image: image(raw.image),
    authorName: raw.authorV2?.name ?? null,
    tags: raw.tags ?? [],
  };
}

export function normalizeCart(raw: Raw): Cart {
  if (raw.lines?.pageInfo?.hasNextPage) {
    throw new Error('This cart contains more than 250 different items. Please complete it in Shopify checkout or start a smaller cart.');
  }
  const lines: CartLine[] = (raw.lines?.nodes ?? []).map((line: Raw) => {
    const variant = line.merchandise;
    const product = variant?.product;
    const courseStartsAt = metafieldValue(variant?.startsAt);
    const isGiftCard = product?.isGiftCard === true;
    const isManualVoucher = isManualLatteArtGiftCard({
      handle: product?.handle ?? '', tags: Array.isArray(product?.tags) ? product.tags : [], isGiftCard,
    });
    const attributes = Array.isArray(line.attributes) ? line.attributes.filter((attribute: Raw) =>
      attribute && [VOUCHER_RECIPIENT_KEY, VOUCHER_DEDICATION_KEY].includes(attribute.key) &&
      typeof attribute.value === 'string').map(({ key, value }: Raw) => ({ key, value })) : [];
    const isCourse = !isGiftCard && !isManualVoucher && (product?.productType?.toLowerCase() === 'course' ||
      product?.tags?.some((tag: string) => tag.toLowerCase() === 'course') ||
      courseStartsAt !== null || metafieldValue(product?.courseDuration) !== null);
    return {
      id: line.id,
      quantity: line.quantity,
      merchandiseId: line.merchandise?.id,
      productTitle: line.merchandise?.product?.title ?? '',
      variantTitle: line.merchandise?.title ?? '',
      productHandle: line.merchandise?.product?.handle ?? '',
      isGiftCard,
      ...(isManualVoucher ? { isManualVoucher: true } : {}),
      ...(attributes.length ? { attributes } : {}),
      ...(isCourse ? { courseStartsAt } : {}),
      image: image(line.merchandise?.image),
      unitPrice: line.cost?.amountPerQuantity,
      totalAmount: line.cost?.totalAmount,
    };
  });

  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity ?? 0,
    subtotal: raw.cost?.subtotalAmount ?? { amount: '0', currencyCode: 'CZK' },
    lines,
  };
}
