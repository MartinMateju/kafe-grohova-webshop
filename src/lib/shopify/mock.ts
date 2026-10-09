/**
 * Demonstration data only. Shared with scripts/generate-demo-catalog.mjs so
 * local prices, options, stock and course dates match the importable catalog.
 */
import catalog from '../../../data/demo-catalog.json';
import { courseDates, courseDateLabel, demoBaseDate } from '../../../data/demo-dates.mjs';
import type { Article, Product, Variant } from './types';
import type { Lang } from '../../i18n/ui';

const baseDate = demoBaseDate();
const money = (amount: number) => ({ amount: amount.toFixed(2), currencyCode: catalog.currency });

function products(lang: Lang, courses: boolean): Product[] {
  return catalog.products.filter(product => Boolean(product.course) === courses).map(product => {
    const variants: Variant[] = product.variants.map(variant => {
      const dates = product.course && variant.offsetDays !== null && variant.localHour !== null
        ? courseDates(baseDate, variant.offsetDays, variant.localHour, product.course.durationMinutes)
        : { startsAt: null, endsAt: null };
      const title = dates.startsAt ? courseDateLabel(dates.startsAt, lang) : variant.value?.[lang] ?? 'Default Title';
      return {
        id: variant.id, title,
        availableForSale: variant.quantity > 0,
        quantityAvailable: variant.quantity,
        price: money(variant.price), compareAtPrice: null,
        selectedOptions: [{ name: product.optionName[lang], value: title }],
        image: product.images[0] ?? null,
        ...dates,
      };
    });
    const prices = variants.map(variant => Number(variant.price.amount));
    return {
      id: product.id, handle: product.handle, title: product.title[lang],
      description: product.descriptionHtml[lang].replace(/<[^>]+>/g, ' ').trim(),
      descriptionHtml: product.descriptionHtml[lang],
      productType: product.productType, tags: [...product.tags],
      availableForSale: variants.some(variant => variant.availableForSale),
      featuredImage: product.images[0] ?? null, images: product.images.map(image => ({ ...image })),
      options: [{ id: `opt-${product.handle}`, name: product.optionName[lang], values: variants.map(variant => variant.title) }],
      variants,
      priceRange: { minVariantPrice: money(Math.min(...prices)), maxVariantPrice: money(Math.max(...prices)) },
      course: product.course ? {
        durationMinutes: product.course.durationMinutes, capacity: product.course.capacity,
        level: product.course.level[lang], syllabus: [...product.course.syllabus[lang]],
      } : null,
    };
  });
}

export function mockCourses(lang: Lang): Product[] {
  return products(lang, true);
}

export function mockMerch(lang: Lang): Product[] {
  return products(lang, false);
}

export function mockArticles(lang: Lang): Article[] {
  const midnight = Date.parse(`${baseDate}T00:00:00Z`);
  return catalog.articles.map((article, index) => ({
    id: `gid://shopify/Article/mock-${article.handle.cs}`,
    handle: article.handle[lang], title: article.title[lang],
    excerpt: article.text[lang], excerptHtml: `<p>${article.text[lang]}</p>`,
    contentHtml: `<p>${article.text[lang]}</p>`,
    publishedAt: new Date(midnight - (index + 1) * 9 * 86_400_000).toISOString(),
    image: { url: article.image, altText: article.title[lang], width: null, height: null },
    authorName: lang === 'cs' ? 'Ukázkový obsah' : 'Demo content', tags: ['demo'],
  }));
}
