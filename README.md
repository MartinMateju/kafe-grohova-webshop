# Kafe Grohova webshop

Czech/English Astro storefront for **kafegrohova.cz**, with Shopify products, course seats and hosted checkout. Kafe Grohova uses its **own Shopify store**, separate from the other shop. Nothing in this repository connects to or changes that other store.

This is a headless storefront: deploy the static website to a host such as Netlify and connect it to the dedicated Shopify store. It is **not** a Liquid theme ZIP for Shopify's theme editor. Shopify Oxygen hosting is intended for Hydrogen; this project retains the existing Astro implementation.

## Run the demo

Use Node 22 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:4321. No Shopify account or credentials are required. The demo includes 3 courses, 8 merchandise/gift products and 4 articles, in both languages. Course sessions roll into the future at build/start time and use Europe/Prague. Prices are CZK.

The cart supports variants, quantities, stock limits, removal and persistence. Demo checkout is disabled and pages carry a DEMO banner and noindex metadata. Contact opens an email draft; it does not send mail or falsely report a submission. The blog contact link is not a mailing-list signup.

```sh
npm run validate             # Astro check, regression tests, production build
npx playwright install chromium
npm run test:e2e             # desktop + mobile browser tests against demo mode
npm run build
npm run preview             # serve the static production output locally
```

`dist/` is the deployable website. CI runs validation and the browser tests on pull requests.

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

4. Create the `barista-kurzy` and `merch` collections, assign the appropriate products, activate the reviewed products and publish them to the **Headless** sales channel. Confirm collection publication too. An empty merch collection stays empty; a missing merch collection falls back to non-course products. The courses collection is required.
5. Configure the Czech market, CZK pricing, shipping for merchandise, payment/test mode and Shopify checkout settings in this dedicated store. Both site languages currently use the Czech market.
6. Add translations through Shopify Translate & Adapt; the app queries `CS` and `EN`. Language links match resource IDs even when article/product handles are translated.

Current official setup: [Storefront API getting started](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started), [headless framework options](https://shopify.dev/docs/storefronts/headless/getting-started/build-options), [API version support](https://shopify.dev/docs/api/usage/versioning).

## Import the dummy data

See [demo catalog instructions](docs/demo-catalog.md) for the exact import process and limitations.

```sh
npm run catalog:generate
# Reproducible example, with public URLs only when those images are actually hosted:
node scripts/generate-demo-catalog.mjs --date 2026-10-09 --lang cs
```

`data/shopify/products.csv` contains **10 draft products / 22 variants**. Course metadata and image manifests are included beside it. All products are initially unpublished and carry a `demo` tag. Review in Kafe Grohova's dedicated store before activating any products. Prices, quantities, articles and descriptions are sample content.

The local gift-card example is deliberately excluded from CSV: create a native Shopify gift-card product in Shopify Admin, then add it to `merch`. Course variant metafields and translations also need setup; the sidecar JSON documents their values and is not an Admin import endpoint. Without a public image base, upload images from `public/` using the image manifest.

## Courses and seats

One product per course, one variant per date. Set product type `Course` or tag `course`, and include it in `barista-kurzy`. Track inventory per variant with quantity equal to available seats, disable continuing sales when out of stock, and mark courses as not requiring shipping.

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

Adding a course to the cart does not reserve a seat. Shopify validates stock at checkout; an order must be completed to book. Customer details come from checkout. Per-attendee names, reminder emails and calendar invites are not implemented.

## Verify the actual store

After credentials, products and metafields are configured:

```sh
npm run shopify:verify              # read-only catalog and inventory checks
npm run shopify:verify -- --connection-only # authenticate a new store before import
npm run shopify:verify -- --cart    # create one test cart, validate checkout URL, empty it
```

The connection-only check reports shop identity and currency; it does not establish launch readiness. The full check validates CZK, both catalogs and course timestamps, and warns when there are no future bookable sessions to test. The cart probe does not open checkout, take payment or place an order. Finish a separate Shopify test-payment walkthrough for merchandise and a course before accepting real orders. That walkthrough requires access to the dedicated store and has not been performed by the local demo tests.

## Deployment and updates

For Netlify, this repository includes `netlify.toml`: build `npm run build`, publish `dist`, Node 22. Put the dedicated store's public environment variables in the hosting project's build settings. Set `PUBLIC_SHOPIFY_MODE=live` and `PUBLIC_SITE_URL=https://kafegrohova.cz`. Configure the public domain on the hosting project only after reviewing its preview and testing the dedicated Shopify connection. Keep the other shop's hosting and domain settings separate.

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

Keep global CSS inside Tailwind layers so utilities retain their expected precedence.
