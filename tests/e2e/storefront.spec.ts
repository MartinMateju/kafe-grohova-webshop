import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../data/demo-catalog.json', import.meta.url), 'utf8'));
const merch = catalog.products.find((product: any) => !product.course && product.variants.some((variant: any) => variant.quantity > 3));
const course = catalog.products.find((product: any) => product.course && product.variants.some((variant: any) => variant.quantity === 0));
const gift = catalog.products.find((product: any) => product.productType === 'Gift Card');
const visibleCartToggle = '[data-cart-toggle]:visible';

test('Czech and English core pages load with images and no horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const lang of ['cs', 'en']) {
    for (const route of ['', 'store', 'courses', 'blog', 'contact']) {
      const response = await page.goto(`/${lang}/${route}`);
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('[data-mock-banner]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await page.locator('img').evaluateAll(images => (images as HTMLImageElement[]).filter(image => image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0))).toBeTruthy();
    }
  }
  expect(errors).toEqual([]);
});

test('merchandise cart persists, updates quantity, removes lines, and disables demo checkout', async ({ page }) => {
  await page.goto(`/en/store/${merch.handle}`);
  await page.locator('[data-add]').click();
  await expect(page.locator('[data-cart-panel]')).toBeVisible();
  const rows = page.locator('[data-cart-body] [data-line]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(merch.title.en);
  await expect(page.locator('[data-cart-checkout]')).toBeDisabled();
  await rows.locator('[data-qty-up]').click();
  await expect(rows.locator('span.min-w-8')).toHaveText('2');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator(visibleCartToggle).click();
  await expect(rows.locator('span.min-w-8')).toHaveText('2');
  await rows.locator('[data-line-remove]').click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('[data-cart-body]')).toContainText('Your cart is empty');
});

test('course date selection respects sold-out dates and seat capacity', async ({ page }) => {
  await page.goto(`/en/courses/${course.handle}`);
  const full = course.variants.find((variant: any) => variant.quantity === 0);
  await expect(page.locator(`[data-date="${full.id}"]`)).toBeDisabled();
  const selected = course.variants.find((variant: any) => variant.quantity > 0);
  await page.locator(`[data-date="${selected.id}"]`).click();
  await page.locator('[data-seats]').fill('99');
  await page.locator('[data-seats]').blur();
  await expect(page.locator('[data-seats]')).toHaveValue(String(selected.quantity));
  await page.locator('[data-book]').click();
  await expect(page.locator('[data-cart-body]')).toContainText(course.title.en);
  await expect(page.locator('[data-cart-body] span.min-w-8')).toHaveText(String(selected.quantity));
});

test('gift card denomination updates displayed price and cart total', async ({ page }) => {
  await page.goto(`/en/store/${gift.handle}`);
  const variant = gift.variants.at(-1);
  await page.locator(`[data-variant="${variant.id}"]`).click();
  await expect(page.locator('[data-product-price]')).toContainText('3,000');
  await page.locator('[data-add]').click();
  await expect(page.locator('[data-cart-subtotal]')).toContainText('3,000');
});

test('translated article URLs switch to the same article', async ({ page }) => {
  const article = catalog.articles.find((item: any) => item.handle.cs !== item.handle.en);
  await page.goto(`/cs/blog/${article.handle.cs}`);
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.locator('[data-menu-toggle]').click();
    await expect(page.locator('[data-menu-label]')).toHaveText('✕ ZAVŘÍT');
  }
  await page.locator('a[hreflang="en"]:visible').first().click();
  await expect(page).toHaveURL(new RegExp(`/en/blog/${article.handle.en}/?$`));
  await expect(page.locator('h1')).toHaveText(article.title.en);
});

test('navigation fits tablet and desktop widths in both languages', async ({ page }) => {
  for (const width of [768, 1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ['cs', 'en']) {
      await page.goto(`/${lang}/`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} at ${width}px`).toBeTruthy();
      await expect(page.locator(visibleCartToggle)).toBeVisible();
    }
  }
});

test('cart traps keyboard focus and restores it when closed', async ({ page }) => {
  await page.goto('/en/');
  const toggle = page.locator(visibleCartToggle);
  await toggle.click();
  const panel = page.locator('[data-cart-panel]');
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-cart-close]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await panel.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
});

test('demo cart works for the current page when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto(`/en/store/${merch.handle}`);
  await page.locator('[data-add]').click();
  await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(1);
  await page.locator('[data-cart-body] [data-qty-up]').click();
  await expect(page.locator('[data-cart-body] span.min-w-8')).toHaveText('2');
});
