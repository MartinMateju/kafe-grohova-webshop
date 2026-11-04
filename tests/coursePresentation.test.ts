import assert from 'node:assert/strict';
import test from 'node:test';
import { mockCourses, mockMerch } from '../src/lib/shopify/mock';
import {
  firstBookableCourseVariant, isComingSoonCourse, isComingSoonCourseHandle,
  isLatteArtGiftCard, isManualLatteArtGiftCard, isLatteArtCourse, resolveLatteArtGiftCard, LATTE_ART_START,
} from '../src/lib/coursePresentation';
import type { Product } from '../src/lib/shopify/types';

const beforeLaunch = Date.parse('2026-11-03T12:00:00Z');
function latte(): Product {
  return mockCourses('cs').find(product => product.handle === 'latte-art')!;
}
function courseGift(): Product {
  return mockMerch('cs').find(product => product.handle === 'poukaz-latte-art')!;
}

test('the one confirmed latte session preserves actual variant identity, dates and price', () => {
  const product = latte();
  product.variants.unshift({ ...product.variants[0], id: 'earlier-unoffered', startsAt: '2026-11-10T16:00:00Z' });
  product.variants.push({ ...product.variants[1], id: 'later-unoffered', startsAt: '2026-12-10T16:00:00Z' });
  const original = structuredClone(product);
  const selected = firstBookableCourseVariant(product, beforeLaunch)!;
  assert.equal(selected.id, original.variants[1].id);
  assert.equal(selected.startsAt, LATTE_ART_START);
  assert.equal(selected.endsAt, '2026-11-25T18:30:00.000Z');
  assert.deepEqual(selected.price, { amount: '2100.00', currencyCode: 'CZK' });
  assert.deepEqual(product, original, 'Presentation must not mutate Shopify records');
});

test('latte does not offer a mismatched currency, amount or duration', () => {
  for (const patch of [
    { price: { amount: '1800.00', currencyCode: 'CZK' } },
    { price: { amount: '2100.00', currencyCode: 'EUR' } },
    { endsAt: '2026-11-25T19:00:00.000Z' },
    { startsAt: null }, { startsAt: 'not a date' },
  ]) {
    const product = latte();
    Object.assign(product.variants[0], patch);
    assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
  }
});

test('the fixed course expires and obeys stock, sale availability and capacity', () => {
  const product = latte();
  assert.equal(firstBookableCourseVariant(product, Date.parse(LATTE_ART_START)), null);
  product.variants[0].quantityAvailable = 99;
  assert.equal(firstBookableCourseVariant(product, beforeLaunch)?.quantityAvailable, 2);
  assert.equal(product.variants[0].quantityAvailable, 99);
  product.variants[0].quantityAvailable = null;
  assert.equal(firstBookableCourseVariant(product, beforeLaunch)?.quantityAvailable, null);
  product.variants[0].availableForSale = false;
  assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
  product.variants[0].availableForSale = true;
  product.variants[0].quantityAvailable = 0;
  assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
  product.variants[0].quantityAvailable = 2;
  product.course!.capacity = 0;
  assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
});

test('cupping, sensory and filtered deep links stay pending despite old in-stock dates', () => {
  for (const handle of ['cupping', 'senzorika', 'sensory', 'sensory-skills', 'filtrovana-kava']) {
    assert.equal(isComingSoonCourseHandle(handle.toUpperCase()), true);
    const product = { ...latte(), handle, tags: ['course'] };
    assert.equal(isComingSoonCourse(product), true);
    assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
  }
  for (const tag of ['CUPPING', 'sensory', 'filter', 'coming-soon', 'course-coming-soon']) {
    const product = { ...latte(), handle: 'future-course', tags: ['course', tag] };
    assert.equal(firstBookableCourseVariant(product, beforeLaunch), null);
  }
});

test('an unrelated course selects just its earliest actual bookable date', () => {
  const product = { ...latte(), handle: 'other-course', tags: ['course'] };
  product.variants = [
    { ...product.variants[0], id: 'later', startsAt: '2026-12-01T16:00:00Z' },
    { ...product.variants[0], id: 'sold-out', startsAt: '2026-11-05T16:00:00Z', quantityAvailable: 0 },
    { ...product.variants[0], id: 'earliest', startsAt: '2026-11-06T16:00:00Z' },
  ];
  assert.equal(firstBookableCourseVariant(product, beforeLaunch)?.id, 'earliest');
});

test('manual vouchers require an explicit tag and remain separate from native cards and courses', () => {
  const gift = courseGift();
  assert.equal(gift.isGiftCard, false);
  assert.equal(isManualLatteArtGiftCard(gift), true);
  assert.equal(isLatteArtGiftCard(gift), true);
  const untagged = { ...gift, tags: ['gift'] };
  assert.equal(isLatteArtGiftCard(untagged), false, 'An ordinary product handle alone must not enable voucher checkout');
  assert.equal(resolveLatteArtGiftCard([untagged]), null);
  const generic = mockMerch('cs').find(product => product.handle === 'darkovy-poukaz')!;
  assert.equal(resolveLatteArtGiftCard([generic]), null);
  assert.equal(isLatteArtGiftCard({ ...gift, handle: 'custom-live-handle' }), true);
  const tagged = { ...gift, tags: [...gift.tags, 'latte-art', 'sensory', 'coming-soon'] };
  assert.equal(isComingSoonCourse(tagged), false);
  assert.equal(isLatteArtCourse(tagged), false);
  assert.equal(firstBookableCourseVariant(tagged, beforeLaunch), null);
  assert.equal(resolveLatteArtGiftCard([{ ...gift, isGiftCard: true }])?.isGiftCard, true, 'Existing explicit native gift cards retain their identity');
});

test('manual course vouchers reject physical or unknown shipping variants', () => {
  for (const requiresShipping of [true, undefined]) {
    const gift = courseGift();
    gift.variants[0].requiresShipping = requiresShipping;
    assert.equal(resolveLatteArtGiftCard([gift]), null);
  }
  const gift = courseGift();
  gift.variants[0].quantityAvailable = 0;
  assert(resolveLatteArtGiftCard([gift]), 'Untracked digital vouchers use availableForSale rather than seat inventory');
});

test('course voucher filters actual CZK2100 variants without relabeling another denomination', () => {
  const gift = courseGift();
  const expected = structuredClone(gift.variants[0]);
  gift.variants.unshift({ ...expected, id: 'wrong-value', price: { amount: '2000', currencyCode: 'CZK' } });
  gift.variants.push({ ...expected, id: 'wrong-currency', price: { amount: '2100', currencyCode: 'EUR' } });
  const original = structuredClone(gift);
  const selected = resolveLatteArtGiftCard([gift])!;
  assert.equal(selected.id, gift.id);
  assert.deepEqual(selected.variants, [expected]);
  assert.deepEqual(selected.priceRange, { minVariantPrice: expected.price, maxVariantPrice: expected.price });
  assert.deepEqual(gift, original);
});

test('missing or unavailable correct-value gift variants produce an honest unavailable state', () => {
  const gift = courseGift();
  gift.variants[0].availableForSale = false;
  assert.equal(resolveLatteArtGiftCard([gift]), null);
  gift.variants[0].availableForSale = true;
  gift.variants[0].price.amount = '2200.00';
  assert.equal(resolveLatteArtGiftCard([gift]), null);
  assert.equal(resolveLatteArtGiftCard([]), null);
});
