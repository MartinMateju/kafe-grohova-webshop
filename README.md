# Kafe Grohova webshop

Czech/English Astro storefront for **kafegrohova.cz**, with Shopify products, course seats and hosted checkout. Kafe Grohova uses its **own Shopify store**, separate from the other shop. Nothing in this repository connects to or changes that other store.

This is a headless storefront: deploy the static website to **Vercel** and connect it to the dedicated Shopify store. It is **not** a Liquid theme ZIP for Shopify's theme editor. Shopify Oxygen hosting is intended for Hydrogen; this project retains the existing Astro implementation.

## Run the demo

Use Node 22:

```sh
npm ci
npm run dev
```

Open http://localhost:4321. No Shopify account or credentials are required. The demo features one beginner latte-art session: **25 November 2026, 17:00–19:30 Europe/Prague, CZK 2,100 per person**, with the existing two-person capacity. Sensory skills and cupping are marked “Coming soon”; retained filtered-coffee detail pages also cannot be booked. The latte-art date is fixed, not rolled forward. A manually prepared CZK 2,100 course voucher accompanies the retained native monetary gift-card fixtures (1,000 / 2,000 / 3,000 CZK). Four articles are available in both languages. Seven physical-product fixtures remain behind the merchandise flag.

The visual system follows the Kafe Grohova brand manual: warm paper, terracotta, ink, cobalt, olive and honey; the original DIN wordmark; Switzer typography with true italic accents. Switzer is loaded through the official [Fontshare CSS API](https://www.fontshare.com/fonts/switzer), with system-font fallbacks and font-display swap. Font files are not redistributed in this repository. New photographs are mixed with the original archive. The homepage has separate landscape/portrait hero assets. Image provenance and sizes are recorded in [docs/brand-photos.json](docs/brand-photos.json). Musical references are artist names and original copy, not reproduced song lyrics.

`PUBLIC_MERCH_ENABLED=false` is the default. It hides physical merchandise from store navigation, product cards, detail routes and restored carts, and sends the store landing page to courses. Set `PUBLIC_MERCH_ENABLED=true` in the relevant Vercel environments and rebuild to restore physical products when photos are ready. Vouchers and gift cards are independently enabled by `PUBLIC_GIFT_CARDS_ENABLED=true` (the default), with their own `/cs/gift-cards/` and `/en/gift-cards/` pages. Set that flag to `false` and rebuild to hide them. No Shopify products are deleted by either setting.

The cart supports variants, quantities, stock limits, removal and persistence. Demo checkout is disabled and pages carry a DEMO banner and noindex metadata. Contact opens an email draft; it does not send mail or falsely report a submission. The blog contact link is not a mailing-list signup.

```sh
npm run validate             # Astro check, regression tests, production build
npx playwright install chromium
npm run test:e2e             # desktop + mobile browser tests against demo mode
npm run build
npm run preview             # serve the static production output locally
```

`dist/` is the deployable website. CI runs validation and the browser tests on pull requests.

### Italic accents

Italic text always uses a contrasting brand color: terracotta on paper by default, olive in the objects section, and honey on dark blue or ink. The course panel uses olive italic text on a small paper highlight because the other palette colors do not have enough contrast directly on terracotta. The shared rule covers `em`, `i`, and `.italic`, including Shopify rich text; use `--kg-italic-color` and `--kg-italic-background` when adding a different surface.

Homepage headings use distinct poster compositions within that system: the bold “Mimo dav.” lead with a small “V centru” and oversized terracotta “dění.”, three progressively aligned course steps, the stacked uppercase “DOBRÝ VĚCI.” paired with an olive “Žádný drama.” aside, and a staggered two-line gift title. Keep each as one semantic heading, preserve visible accents and descenders, and adapt both Czech and English at mobile and tablet widths. Only the course highlight rotates; its text stays level.

## Dedicated Shopify connection

`kafegrohova.cz` is the public website. Its dedicated Shopify store is **Kafe Grohova Store**, at `b1pnun-1t.myshopify.com` ([admin](https://admin.shopify.com/store/b1pnun-1t/)). This is separate from the other shop.

1. Create or open **Kafe Grohova's own store**. Do not reuse the other shop's credentials.
2. Install Shopify's **Headless** sales channel and create a storefront. Copy its **public Storefront API access token**. In **Storefront API permissions → Edit**, enable the permissions used by this code:

| Scope | Purpose |
| --- | --- |
| `unauthenticated_read_product_listings` | Products, variants and collections |
| `unauthenticated_read_product_inventory` | Course seats and stock availability |
| `unauthenticated_read_product_tags` | Course/merchandise classification |
| `unauthenticated_read_content` | Blog articles |
| `unauthenticated_read_checkouts` | Cart reads |
| `unauthenticated_write_checkouts` | Cart creation and changes |
3. Copy `.env.example` to `.env` and fill in:

```dotenv
PUBLIC_SHOPIFY_MODE=live
PUBLIC_MERCH_ENABLED=false
PUBLIC_GIFT_CARDS_ENABLED=true
PUBLIC_SHOPIFY_STORE_DOMAIN=b1pnun-1t.myshopify.com
PUBLIC_SHOPIFY_STOREFRONT_TOKEN=your-public-storefront-token
PUBLIC_SHOPIFY_API_VERSION=2026-07
PUBLIC_SHOPIFY_COURSES_COLLECTION=barista-kurzy
PUBLIC_SHOPIFY_MERCH_COLLECTION=merch
PUBLIC_SHOPIFY_BLOG_HANDLE=news
PUBLIC_SITE_URL=https://kafegrohova.cz
```

The public token is intentionally used in the browser. **Never enter an Admin API token or private Storefront token in a `PUBLIC_*` variable.** The app rejects recognizable private/Admin token prefixes.

Modes: `auto` (default) uses demo only with both credentials absent; `demo` explicitly uses fixtures; `live` requires valid credentials. A partial configuration or failed live API request fails visibly instead of silently publishing an empty or demo catalog. Set `live` explicitly in production.

4. Create the `barista-kurzy` collection, assign the course products, activate the reviewed products and publish them to the **Headless** sales channel. Confirm collection publication too. The `merch` collection is needed only when merchandise is restored. An empty merch collection stays empty; a missing merch collection falls back to non-course products. The courses collection is required.
5. Configure the Czech market, CZK pricing and a manual payment method in this dedicated store. Customers complete an unpaid order without an online payment gateway. Course orders reserve seats and receive the Shopify order confirmation; the studio sends invoices and payment details separately. Both site languages use the Czech market. Verify the order notification and inventory behavior before release.
6. Add translations through Shopify Translate & Adapt; the app queries `CS` and `EN`. Language links match resource IDs even when article/product handles are translated.

Current official setup: [Storefront API getting started](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started), [headless framework options](https://shopify.dev/docs/storefronts/headless/getting-started/build-options), [API version support](https://shopify.dev/docs/api/usage/versioning).

## Import the dummy data

See [demo catalog instructions](docs/demo-catalog.md) for the exact import process and limitations.

```sh
npm run catalog:generate -- --courses-only
# Reproducible example, with public URLs only when those images are actually hosted:
node scripts/generate-demo-catalog.mjs --courses-only --date 2026-10-10 --lang cs
```

`data/shopify/products.csv` contains **3 draft courses / 7 date variants**. Course metadata and image manifests are included beside it. All products are initially unpublished and carry a `demo` tag. The latte-art fixture reflects the confirmed November offer; the other course fixtures are retained for reference and cannot be booked through this release. Review all imported data in Kafe Grohova's dedicated store before activation. Omit `--courses-only` to export the retained full catalog later (10 products / 20 variants, excluding the native gift card and manually configured course voucher).

Both voucher examples are deliberately excluded from CSV. Create the featured manual voucher as the standard nonphysical product described below; the retained generic monetary gift card uses a native Shopify gift-card product. Publish reviewed products to Headless. It does not need the `merch` collection. Course variant metafields and translations also need setup; the sidecar JSON documents their values and is not an Admin import endpoint. Without a public image base, upload images from `public/` using the image manifest.

## Manual course vouchers and retained native gift cards

The gift catalog accepts native Shopify `isGiftCard` products and the explicitly tagged manual latte-art voucher. A product name or handle alone does not enable the manual workflow. Physical merchandise remains hidden, and course limits remain 2 / 4 / 4.

The featured course voucher is a **standard nonphysical Shopify product**, not a native gift card: handle `poukaz-latte-art`, required tag `course-voucher:latte-art`, and an available **CZK 2,100** variant with `requiresShipping=false`. Publish it to Headless and the Czech market. Inventory does not represent course seats and can be untracked; the Storefront sale flag is authoritative. The tag preserves identity when handles are translated. A missing tag, wrong price/currency, or physical/unknown shipping variant prevents voucher checkout.

The customer enters a required recipient name (up to 100 characters) and optional dedication (up to 500). The cart displays these fields and sends them to Shopify as line attributes `Obdarovaný` and `Věnování`. Separate recipients remain separate cart lines. Invalid or missing recipient details block adding the voucher and checkout of a restored cart.

After the unpaid order is completed, Shopify sends its order confirmation. **The studio manually prepares and emails the personalised voucher and invoice to the purchaser within 2 hours of the order.** This workflow does not wait for a paid event, issue an automatic Shopify gift code, or send an automatic voucher PDF. Staff must monitor order notifications and deliver the promised email. The recipient contacts the studio to arrange an available date and use the voucher; purchasing the voucher does not reserve a course seat. The public artwork is only a design preview.

The retained generic monetary gift card is a separate, optional native Shopify product: **Products → Gift cards → Add a gift card product**, with reviewed 1,000 / 2,000 / 3,000 CZK values and handle `darkovy-poukaz`. Set it active, publish it to the Headless sales channel, and ensure it is available in the Czech market. The gift-card catalog is read independently of collections. Confirm the gift-card fulfillment and customer email settings, then test purchase, fulfillment, delivery of a unique gift code, and redemption against a course order. A public Storefront token can query and buy a published product; it cannot create products or configure fulfillment.

For that optional native product only, Shopify issues a redeemable gift code when its order is fulfilled. Keep native gift-card fulfillment separate from the manual course-voucher workflow. The downloadable `public/downloads/gift-card-sample.pdf` is an original bilingual A5 design preview with no monetary value or valid code. Its rendered image is `public/gift-card-preview.png`. To replace the design later, replace those two files and rebuild; update the product image in Shopify for live mode. Never embed a real customer's gift-card code in these public files. This app does not automatically personalize or attach PDFs to order emails; Shopify's gift-card email carries the actual code. A personalized PDF delivery service would need a separate fulfillment integration.

Enable live mode only after the manual voucher, course collection, real course dates, manual checkout and order notifications have been verified. See [Shopify gift-card products](https://help.shopify.com/en/manual/products/gift-card-products/add-update-gift-card-products) and [gift-card fulfillment](https://help.shopify.com/en/manual/products/gift-card-products/overview).

## Courses and seats

One product per course, one variant per date. Set product type `Course` or tag `course`, and include it in `barista-kurzy`. Track inventory per variant with quantity equal to available seats, disable continuing sales when out of stock, and mark courses as not requiring shipping.

For this release, the beginner latte-art variant must match the confirmed offer exactly: `course.starts_at=2026-11-25T16:00:00.000Z`, `course.ends_at=2026-11-25T18:30:00.000Z`, **CZK 2,100**, and product `course.duration_minutes=150`. These UTC times are 17:00–19:30 in Prague. The policy in `src/lib/coursePresentation.ts` selects only that actual future variant and rechecks it before cart/checkout. Missing or mismatched data does not create a fake purchasable session. Update this explicit launch policy when publishing a new offer; rebuild the static site after catalogue changes. Cupping, sensory and filtered-coffee fixtures remain unbookable, including through restored carts.

Group limits are **2 for beginner latte art**, **4 for cupping**, and **4 for filtered coffee**. Set both the `course.capacity` product metafield and each date variant's Shopify inventory correctly. The booking controls and cart enforce the per-session limit; Shopify inventory prevents overselling across customers. For an existing session, available inventory is the group limit minus places already sold, not a fresh reset to the full capacity.

Create these custom-data definitions and allow public Storefront read access:

| Owner | Namespace/key | Type |
| --- | --- | --- |
| Product | `course.duration_minutes` | Integer |
| Product | `course.capacity` | Integer |
| Product | `course.level` | Single-line text |
| Product | `course.syllabus` | List of single-line text |
| Variant | `course.starts_at` | Date and time |
| Variant | `course.ends_at` | Date and time |

Use ISO timestamps including timezone offsets. A missing start date can display a legacy variant title, but is unsuitable for time-sensitive booking: configure the metafields before launch. Invalid/expired dates are disabled. Retire expired variants in Shopify too, because a browser check cannot protect external or already-open checkout links.

Adding a course to the cart does not reserve a seat. The completed unpaid Shopify order commits its seats immediately and sends the order confirmation; the studio sends the invoice and payment details separately. Verify this behavior with the active manual payment method and tracked inventory. Cancelling an order must release seats using Shopify’s restock option where appropriate. Customer details come from checkout. Per-attendee course names, reminder emails and calendar invites are not implemented.

Course cards state the maximum group size, not remaining seats, and link to current availability. The booking detail refreshes Shopify availability on load, when returning to the page and every 30 seconds while visible. It retains the scheduled variant when sold out so a released seat can reappear without rebuilding. Cart additions and checkout recheck stock independently.

## Verify the actual store

After credentials, products and metafields are configured:

```sh
npm run shopify:verify              # read-only catalog and inventory checks
npm run shopify:verify -- --connection-only # authenticate a new store before import
npm run shopify:verify -- --cart    # create one test cart, validate checkout URL, empty it
```

The connection-only check reports shop identity and currency; it does not establish launch readiness. The full check validates CZK, course timestamps and the enabled catalogs, and warns when there are no future bookable sessions to test. The cart probe does not open checkout, take payment or place an order. Finish a separate manual-order walkthrough before accepting customers: submit an unpaid course order, verify the pending-payment status, immediate seat reduction and confirmation email; then submit a personalised voucher order and verify both line attributes, confirmation and the studio’s voucher/invoice delivery within 2 hours. Do not mark an order paid merely to test this flow. The local demo tests do not prove remote order creation, email delivery or manual fulfillment.

## Deployment and updates

The dedicated Vercel project is [martinmatejus-projects/kafe-grohova-webshop](https://vercel.com/martinmatejus-projects/kafe-grohova-webshop), connected to this GitHub repository. The [public deployment](https://kafe-grohova-webshop.vercel.app/cs/) uses the mode configured for its Vercel environment; demo mode disables checkout, while live mode submits Shopify orders. The live-shop domain is `kafegrohova.cz`; connect it after the Shopify catalog and checkout checks pass.

The repository includes `vercel.json`: Astro framework, install `npm ci --no-audit`, build `npm run build`, output `dist`, a temporary root redirect to `/cs/`, trailing-slash routes and basic response headers. This static app does not need the Vercel server-rendering adapter. Use Node **22.x** in Vercel's project settings.

1. Import `MartinMateju/kafe-grohova-webshop` into a dedicated Vercel project, with the repository root as Root Directory. Select the release branch for the initial review, or merge the release PR before deploying `main`.
2. For a **demo deployment**, set `PUBLIC_SHOPIFY_MODE=demo`. No Shopify credentials are needed; checkout remains disabled and the demo banner/noindex metadata remain visible. Set `PUBLIC_SITE_URL` to the review deployment's stable HTTPS origin if available. Vercel's first deployment may be labeled Production even when it is only a demo on a `vercel.app` address; that is not a live-shop launch.
3. Before the **live release**, set all public variables from the dedicated Shopify connection section in Vercel's **Production** environment, including `PUBLIC_SHOPIFY_MODE=live` and `PUBLIC_SITE_URL=https://kafegrohova.cz`. Keep Preview set to `demo` unless deliberately testing the real store. Store variables in Vercel project settings; `.vercelignore` excludes local environment files from CLI uploads. Environment changes require a new deployment.
4. Run the live-store checks and the manual-order walkthrough described above. Deploy and inspect both languages, product pages, cart, checkout and the 404 page on Vercel before attaching the public domain. The live build must succeed with the published Shopify catalog; do not use demo mode to bypass a failed release check.
5. Add `kafegrohova.cz` and `www.kafegrohova.cz` to this Vercel project, choose the canonical hostname, then update only the DNS records Vercel supplies. Existing DNS currently points to the previous host. Preserve email and unrelated records, and verify HTTPS and redirects after propagation. Keep the other shop's project and domain settings separate.

With Vercel connected to GitHub, pushes create deployments independently of GitHub Actions. Alternatively, authenticate with `npx vercel login`, link the dedicated project with `npx vercel link`, and deploy with `npx vercel`; use `npx vercel --prod` for a subsequent production release. See [Astro on Vercel](https://docs.astro.build/en/guides/deploy/vercel/) and [Vercel deployment commands](https://vercel.com/docs/cli/deploy).

Product, course and blog pages are generated at build time. Live product pages refresh existing variants' price, availability and dates before enabling purchase; Shopify remains authoritative for the cart. **New products, new variants, deleted products, translations and blog edits still need a rebuild.** Rebuild after catalog changes and refresh course listings regularly. A signed Shopify webhook handled by a trusted service can trigger a hosting deploy hook; that automation is not configured in this repo.

Do not upload `dist/` through Shopify's theme editor. For native Shopify hosting a Liquid theme or a Hydrogen migration would be a separate implementation.

## Main files

- `src/lib/shopify/`: validated configuration, GraphQL client, pagination and normalization.
- `src/lib/cart.ts`: demo/live cart and serialized mutations.
- `src/components/`: purchase controls, course booking, accessible cart drawer.
- `data/demo-catalog.json`: shared demo products and articles.
- `scripts/generate-demo-catalog.mjs`: reproducible draft-product export.
- `scripts/verify-shopify.ts`: live-store connection probe.
- `tests/`: cart regressions, translated routes and browser flows.

Keep broad element resets inside Tailwind layers. The explicit brand component classes live in `src/styles/brand.css`; homepage-only art direction lives in `src/styles/homepage.css`.
