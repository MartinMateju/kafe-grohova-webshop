import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../data/demo-catalog.json', import.meta.url), 'utf8'));
const latte = catalog.products.find((product: any) => product.handle === 'latte-art');
const gift = catalog.products.find((product: any) => product.handle === 'darkovy-poukaz');
const courseGift = catalog.products.find((product: any) => product.handle === 'poukaz-latte-art');
const visibleCartToggle = '[data-cart-toggle]:visible';

test('Czech and English core pages load with images and no horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const lang of ['cs', 'en']) {
    const article = catalog.articles.find((item: any) => item.handle.cs !== item.handle.en);
    for (const route of ['', 'courses', `courses/${latte.handle}`, 'courses/cupping', 'courses/filtrovana-kava', 'gift-cards', `gift-cards/${courseGift.handle}`, `gift-cards/${gift.handle}`, 'blog', `blog/${article.handle[lang]}`, 'contact']) {
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
  await expect(rows.locator('[data-line-quantity]')).toHaveText('2');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator(visibleCartToggle).click();
  await expect(rows.locator('[data-line-quantity]')).toHaveText('2');
  await rows.locator('[data-line-remove]').click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('[data-cart-body]')).toContainText('Your cart is empty');
});

test('the single latte-art date is selected and books the advertised session at its actual price', async ({ page }) => {
  await page.goto('/en/courses/');
  await expect(page.locator('[data-upcoming-date]')).toHaveCount(1);
  await page.locator('[data-upcoming-date]').click();
  await expect(page).toHaveURL(/\/en\/courses\/latte-art\/?$/);
  const dates = page.locator('[data-date]');
  await expect(dates).toHaveCount(1);
  await expect(dates).toBeEnabled();
  await expect(dates).toHaveAttribute('aria-pressed', 'true');
  await expect(dates).toHaveAttribute('data-date', latte.variants[0].id);
  await expect(page.locator('[data-date-label]')).toContainText('25');
  await expect(page.locator('[data-date-label]')).toContainText('17:00');
  await expect(page.locator('.detail-description')).toContainText('25 November 2026, 17:00–19:30');
  await expect(page.locator('[data-date-price]')).toContainText('2,100');
  await expect(page.locator('[data-date-stock]')).toContainText('2');
  await expect(page.locator('[data-seats]')).toHaveValue('1');
  await page.locator('[data-book]').click();
  await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(1);
  await expect(page.locator('[data-line-quantity]')).toHaveText('1');
  await expect(page.locator('[data-cart-body]')).toContainText('17:00');
  await expect(page.locator('[data-cart-subtotal]')).toContainText('2,100');
  await expect(page.locator('[data-cart-checkout]')).toBeDisabled();
});

test('cupping, sensory and existing filter-course links do not offer booking', async ({ page }) => {
  for (const lang of ['cs', 'en']) {
    await page.goto(`/${lang}/courses/`);
    for (const handle of ['cupping', 'senzorika']) {
      const card = page.locator(`[data-course-card="${handle}"][data-coming-soon]`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(lang === 'cs' ? 'Připravujeme' : 'Coming soon');
      await expect(card.locator('[data-book], [data-date], [data-course-capacity]')).toHaveCount(0);
    }
    await expect(page.locator('[data-course-card="filtrovana-kava"]')).toHaveCount(0);
    for (const handle of ['cupping', 'filtrovana-kava']) {
      const response = await page.goto(`/${lang}/courses/${handle}/`);
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator('[data-coming-soon]')).toBeVisible();
      await expect(page.locator('[data-coming-soon] a')).toHaveAttribute('href', `/${lang}/contact`);
      await expect(page.locator('[data-book], [data-date], [data-seats], [data-add]')).toHaveCount(0);
    }
  }
});

test('physical merchandise stays hidden while courses and gift cards are featured', async ({ page }) => {
  for (const lang of ['cs', 'en']) {
    await page.goto(`/${lang}/`);
    await expect(page.locator('a[href*="/store"]')).toHaveCount(0);
    await expect(page.locator('a.courses')).toHaveAttribute('href', `/${lang}/courses`);
    await expect(page.locator('a.gift-tile')).toHaveAttribute('href', `/${lang}/gift-cards`);
    await expect(page.locator('[data-home-category]')).toHaveCount(3);
    await expect(page.locator('a[data-home-category], [data-home-category] a')).toHaveCount(0);
    await page.locator('a.courses').click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/courses/?$`));
    await expect(page.locator('[data-course-card="latte-art"] [data-course-capacity]')).toContainText('2');
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

test('homepage navigation preserves both locales, category destinations and the dismissible demo notice', async ({ page }) => {
  for (const lang of ['cs', 'en']) {
    const other = lang === 'cs' ? 'en' : 'cs';
    await page.goto('/' + lang + '/');
    const banner = page.locator('[data-mock-banner]');
    const shell = page.locator('.homepage-shell');
    await expect(banner).toBeVisible();
    const bannerBounds = await banner.boundingBox();
    const shellBounds = await shell.boundingBox();
    expect(bannerBounds).not.toBeNull();
    expect(shellBounds!.y).toBeGreaterThanOrEqual(bannerBounds!.y + bannerBounds!.height - 1);
    await banner.locator('button').click();
    await expect(banner).toHaveCount(0);
    expect((await shell.boundingBox())!.y).toBe(0);

    const menuToggle = page.locator('[data-menu-toggle]:visible');
    // Language switching remains available without first opening the mobile menu.
    const localeLink = page.locator('header a[hreflang="' + other + '"]:visible');
    await expect(localeLink).toBeVisible();
    if (await menuToggle.count()) {
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#mobile-menu')).toBeVisible();
      await expect(page.locator('[data-menu-label]')).toHaveText(lang === 'cs' ? 'Zavřít −' : 'Close −');
    }
    await expect(page.locator(visibleCartToggle)).toHaveCount(1);
    await expect(page.locator('header a[href="/' + lang + '/courses"]:visible').first()).toBeVisible();
    await expect(page.locator('header a[href="/' + lang + '/gift-cards"]:visible').first()).toBeVisible();
    await expect(localeLink).toHaveAttribute('href', new RegExp('^/' + other + '/?$'));
    await localeLink.click();
    await expect(page).toHaveURL(new RegExp('/' + other + '/?$'));
    await expect(page.locator('html')).toHaveAttribute('lang', other);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp('/' + other + '/?$'));
    await expect(page.locator('link[rel="alternate"][hreflang="cs"]')).toHaveAttribute('href', /\/cs\/?$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/?$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await page.locator('a.gift-tile').click();
    await expect(page).toHaveURL(new RegExp('/' + other + '/gift-cards/?$'));
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
  await expect(page.locator('[data-cart-subtotal]')).toContainText('8,100');
  await expect(page.locator('[data-cart-checkout]')).toBeDisabled();
});

test('the generic monetary gift card retains its sample PDF in both languages', async ({ page, request }) => {
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

test('the manual latte-art voucher requires a recipient and keeps the dedication with its 2100 CZK cart line', async ({ page }) => {
  for (const lang of ['cs', 'en']) {
    await page.goto(`/${lang}/gift-cards/`);
    const card = page.locator(`[data-gift-card="${courseGift.handle}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('2 100 Kč');
    await expect(card.locator('figure')).toHaveAccessibleName(/2[ ,]100/);
    await card.locator('a').click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/gift-cards/${courseGift.handle}/?$`));
    const preview = page.locator('figure.course-voucher-art');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(lang === 'cs' ? 'UKÁZKA / NEPLATNÝ POUKAZ' : 'PREVIEW / NOT A VALID VOUCHER');
    await expect(page.locator('[data-product-price]')).toContainText(/2[\s,]100/);
    await expect(page.locator('[data-date], [data-book]')).toHaveCount(0);
    await expect(page.locator('[data-gift-demo]')).toContainText(lang === 'cs' ? 'vypnuté' : 'disabled');
    await page.locator('[data-add]').click();
    await expect(page.locator('[data-voucher-recipient]')).toBeFocused();
    await expect(page.locator('[data-cart-body] [data-line]')).toHaveCount(0);
    await page.locator('[data-voucher-recipient]').fill('Jana Nováková');
    await page.locator('[data-voucher-dedication]').fill('Všechno nejlepší, Jani!');
    await page.locator('[data-add]').click();
    const rows = page.locator('[data-cart-body] [data-line]');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(courseGift.title[lang]);
    await expect(rows).toContainText('Jana Nováková');
    await expect(rows).toContainText('Všechno nejlepší, Jani!');
    await expect(rows.locator('[data-line-quantity]')).toHaveText('1');
    await expect(page.locator('[data-cart-subtotal]')).toContainText(/2[\s,]100/);
    await expect(page.locator('[data-cart-checkout]')).toBeDisabled();
    await rows.locator('[data-line-remove]').click();
    await expect(rows).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});

test('requested course limits apply to booking inputs and cart quantities', async ({ page }) => {
  for (const [handle, limit] of [['latte-art', 2]] as const) {
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
    await expect(row.locator('[data-line-quantity]')).toHaveText(String(limit));
    await row.locator('[data-qty-up]').click();
    await expect(page.locator('[data-cart-error]')).toContainText(`Only ${limit}`);
    await expect(row.locator('[data-line-quantity]')).toHaveText(String(limit));
    await page.keyboard.press('Escape');
  }
});

test('translated article URLs switch to the same article', async ({ page }) => {
  const article = catalog.articles.find((item: any) => item.handle.cs !== item.handle.en);
  await page.goto(`/cs/blog/${article.handle.cs}`);
  await expect(page.locator('header a[hreflang="en"]')).toBeVisible();
  await page.locator('header a[hreflang="en"]').click();
  await expect(page).toHaveURL(new RegExp(`/en/blog/${article.handle.en}/?$`));
  await expect(page.locator('h1')).toHaveText(article.title.en);
});

test('navigation fits tablet and desktop widths in both languages', async ({ page }) => {
  for (const width of [768, 1024, 1100, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ['cs', 'en']) {
      await page.goto(`/${lang}/`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} at ${width}px`).toBeTruthy();
      await expect(page.locator(visibleCartToggle)).toBeVisible();
      await expect(page.locator('header a[hreflang]')).toBeVisible();
      const menuToggle = page.locator('[data-menu-toggle]:visible');
      const usesMenu = await menuToggle.count() > 0;
      if (usesMenu) {
        await menuToggle.click();
        await expect(page.locator('#mobile-menu')).toBeVisible();
        await expect(page.locator('[data-menu-label]')).toHaveText(lang === 'cs' ? 'Zavřít −' : 'Close −');
      }
      await expect(page.locator('header a[href="/' + lang + '/gift-cards"]:visible').first()).toBeVisible();
      if (usesMenu) {
        await menuToggle.click();
        await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#mobile-menu')).toBeHidden();
      }
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
  await expect(page.locator('[data-cart-body] [data-line-quantity]')).toHaveText('2');
});
