import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../data/demo-catalog.json', import.meta.url), 'utf8'));
const course = catalog.products.find((product: any) => product.course && product.variants.some((variant: any) => variant.quantity === 0));
const latte = catalog.products.find((product: any) => product.handle === 'latte-art');
const gift = catalog.products.find((product: any) => product.isGiftCard);
const visibleCartToggle = '[data-cart-toggle]:visible';

test('Czech and English core pages load with images and no horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const lang of ['cs', 'en']) {
    for (const route of ['', 'courses', 'gift-cards', `gift-cards/${gift.handle}`, 'blog', 'contact']) {
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

test('course cart persists, updates quantity, removes lines, and disables demo checkout', async ({ page }) => {
  await page.goto(`/en/courses/${latte.handle}`);
  await page.locator('[data-book]').click();
  await expect(page.locator('[data-cart-panel]')).toBeVisible();
  const rows = page.locator('[data-cart-body] [data-line]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(latte.title.en);
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

test('physical merchandise stays hidden while courses and gift cards are featured', async ({ page }) => {
  for (const lang of ['cs', 'en']) {
    await page.goto(`/${lang}/`);
    await expect(page.locator('a[href*="/store"]')).toHaveCount(0);
    await expect(page.locator(`a[href="/${lang}/gift-cards"]:visible`).first()).toBeVisible();
    await expect(page.locator('[data-course-card="latte-art"] [data-course-capacity]')).toContainText('2');
    await expect(page.locator('[data-course-card="cupping"] [data-course-capacity]')).toContainText('4');
    await expect(page.locator('[data-course-card="filtrovana-kava"] [data-course-capacity]')).toContainText('4');
    await expect(page.locator('a[href="#courses"]')).toBeVisible();
    await expect(page.locator('[data-course-card]')).toHaveCount(3);
    await expect(page.locator('a[href*="espresso-zaklady"]')).toHaveCount(0);
    await page.goto(`/${lang}/store/`);
    await expect(page).toHaveURL(new RegExp(`/${lang}/courses/?$`));
    for (const product of catalog.products.filter((product: any) => !product.course)) {
      const response = await page.goto(`/${lang}/store/${product.handle}/`);
      expect(response?.status()).toBe(404);
      await expect(page.locator('[data-add]')).toHaveCount(0);
    }
    const removedCourse = await page.goto(`/${lang}/courses/espresso-zaklady/`);
    expect(removedCourse?.status()).toBe(404);
  }
});

test('gift-card values have independent cart prices and persist alongside courses', async ({ page }) => {
  await page.goto(`/en/gift-cards/${gift.handle}/`);
  await expect(page.locator('[data-gift-demo]')).toContainText('disabled');
  for (const variant of gift.variants) {
    await page.locator(`[data-variant="${variant.id}"]`).click();
    await expect(page.locator('[data-product-price]')).toContainText(variant.price.toLocaleString('en-GB'));
    await page.locator('[data-add]').click();
    const row = page.locator('[data-cart-body] [data-line]').filter({ hasText: variant.value.en });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(variant.price.toLocaleString('en-GB'));
    await page.keyboard.press('Escape');
  }
  await page.reload();
  await page.locator(visibleCartToggle).click();
  await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(3);
  await expect(page.locator('[data-cart-subtotal]')).toContainText('6,000');
  await page.keyboard.press('Escape');
  await page.goto(`/en/courses/${latte.handle}/`);
  await page.locator('[data-book]').click();
  await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(4);
  await expect(page.locator('[data-cart-subtotal]')).toContainText('7,800');
  await expect(page.locator('[data-cart-checkout]')).toBeDisabled();
});

test('gift-card preview links to a real sample PDF in both languages', async ({ page, request }) => {
  for (const lang of ['cs', 'en']) {
    await page.goto(`/${lang}/gift-cards/`);
    await expect(page.locator(`[data-gift-card="${gift.handle}"]`)).toBeVisible();
    await page.locator(`[data-gift-card="${gift.handle}"] a`).last().click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/gift-cards/${gift.handle}/?$`));
    const preview = page.locator('[data-gift-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('target', '_blank');
    const pdf = await request.get((await preview.getAttribute('href'))!);
    expect(pdf.ok()).toBeTruthy();
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('requested course limits apply to booking inputs and cart quantities', async ({ page }) => {
  for (const [handle, limit] of [['latte-art', 2], ['cupping', 4], ['filtrovana-kava', 4]] as const) {
    const product = catalog.products.find((item: any) => item.handle === handle);
    const session = product.variants.find((variant: any) => variant.quantity === limit);
    await page.goto(`/en/courses/${handle}/`);
    await page.locator(`[data-date="${session.id}"]`).click();
    await page.locator('[data-seats]').fill('99');
    await page.locator('[data-seats]').blur();
    await expect(page.locator('[data-seats]')).toHaveValue(String(limit));
    await expect(page.locator('[data-seat-up]')).toBeDisabled();
    await page.locator('[data-book]').click();
    const row = page.locator('[data-cart-body] [data-line]').filter({ hasText: product.title.en });
    await expect(row.locator('span.min-w-8')).toHaveText(String(limit));
    await row.locator('[data-qty-up]').click();
    await expect(page.locator('[data-cart-error]')).toContainText(`Only ${limit}`);
    await expect(row.locator('span.min-w-8')).toHaveText(String(limit));
    await page.keyboard.press('Escape');
  }
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
  await page.goto(`/en/courses/${latte.handle}`);
  await page.locator('[data-book]').click();
  await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(1);
  await page.locator('[data-cart-body] [data-qty-up]').click();
  await expect(page.locator('[data-cart-body] span.min-w-8')).toHaveText('2');
});
