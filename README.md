# Kafe Grohova webshop

Czech/English Astro storefront for **kafegrohova.cz**, with Shopify products, course seats and hosted checkout. Kafe Grohova uses its **own Shopify store**, separate from the other shop. Nothing in this repository connects to or changes that other store.

This is a headless storefront: deploy the static website to **Vercel** and connect it to the dedicated Shopify store. It is **not** a Liquid theme ZIP for Shopify's theme editor. Shopify Oxygen hosting is intended for Hydrogen; this project retains the existing Astro implementation.

## Run the demo

Use Node 22:

```sh
npm ci
npm run dev
```

Open http://localhost:4321. No Shopify account or credentials are required. The demo shows 3 courses and 4 articles in both languages. Cupping replaces the previous espresso course. Merchandise and gift cards are temporarily hidden; their 8 fixtures remain available for later restoration. Course sessions roll into the future at build/start time and use Europe/Prague. Prices are CZK.

`PUBLIC_MERCH_ENABLED=false` is the default. It hides store navigation, product cards and merchandise detail routes, sends the store landing page to courses, and removes merchandise from restored carts. Set `PUBLIC_MERCH_ENABLED=true` in the relevant Vercel environments and rebuild to restore the shop when photos are ready. No Shopify products are deleted by this setting.

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
PUBLIC_MERCH_ENABLED=false
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
5. Configure the Czech market, CZK pricing, shipping for merchandise, payment/test mode and Shopify checkout settings in this dedicated store. Both site languages currently use the Czech market.
6. Add translations through Shopify Translate & Adapt; the app queries `CS` and `EN`. Language links match resource IDs even when article/product handles are translated.

Current official setup: [Storefront API getting started](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started), [headless framework options](https://shopify.dev/docs/storefronts/headless/getting-started/build-options), [API version support](https://shopify.dev/docs/api/usage/versioning).

## Import the dummy data

See [demo catalog instructions](docs/demo-catalog.md) for the exact import process and limitations.

```sh
npm run catalog:generate -- --courses-only
# Reproducible example, with public URLs only when those images are actually hosted:
node scripts/generate-demo-catalog.mjs --courses-only --date 2026-10-10 --lang cs
```

`data/shopify/products.csv` contains **3 draft courses / 8 date variants**. Course metadata and image manifests are included beside it. All products are initially unpublished and carry a `demo` tag. Review in Kafe Grohova's dedicated store before activating any products. Prices, quantities, articles and descriptions are sample content. Omit `--courses-only` to export the retained full catalog later (10 products / 21 variants, excluding the native gift card).

The local gift-card example is deliberately excluded from CSV: create a native Shopify gift-card product in Shopify Admin, then add it to `merch`. Course variant metafields and translations also need setup; the sidecar JSON documents their values and is not an Admin import endpoint. Without a public image base, upload images from `public/` using the image manifest.

## Courses and seats

One product per course, one variant per date. Set product type `Course` or tag `course`, and include it in `barista-kurzy`. Track inventory per variant with quantity equal to available seats, disable continuing sales when out of stock, and mark courses as not requiring shipping.

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

Adding a course to the cart does not reserve a seat. Shopify validates stock at checkout; an order must be completed to book. Customer details come from checkout. Per-attendee names, reminder emails and calendar invites are not implemented.

## Verify the actual store

After credentials, products and metafields are configured:

```sh
npm run shopify:verify              # read-only catalog and inventory checks
npm run shopify:verify -- --connection-only # authenticate a new store before import
npm run shopify:verify -- --cart    # create one test cart, validate checkout URL, empty it
```

The connection-only check reports shop identity and currency; it does not establish launch readiness. The full check validates CZK, course timestamps and the enabled catalogs, and warns when there are no future bookable sessions to test. The cart probe does not open checkout, take payment or place an order. Finish a separate Shopify test-payment walkthrough for a course before accepting real orders; test merchandise too when it is restored. That walkthrough requires access to the dedicated store and has not been performed by the local demo tests.

## Deployment and updates

The dedicated Vercel project is [martinmatejus-projects/kafe-grohova-webshop](https://vercel.com/martinmatejus-projects/kafe-grohova-webshop), connected to this GitHub repository. The [public review site](https://kafe-grohova-webshop.vercel.app/cs/) uses dummy data with checkout disabled. The live-shop domain is `kafegrohova.cz`; connect it after the Shopify catalog and checkout checks pass.

The repository includes `vercel.json`: Astro framework, install `npm ci --no-audit`, build `npm run build`, output `dist`, a temporary root redirect to `/cs/`, trailing-slash routes and basic response headers. This static app does not need the Vercel server-rendering adapter. Use Node **22.x** in Vercel's project settings.

1. Import `MartinMateju/kafe-grohova-webshop` into a dedicated Vercel project, with the repository root as Root Directory. Select the release branch for the initial review, or merge the release PR before deploying `main`.
2. For a **demo deployment**, set `PUBLIC_SHOPIFY_MODE=demo`. No Shopify credentials are needed; checkout remains disabled and the demo banner/noindex metadata remain visible. Set `PUBLIC_SITE_URL` to the review deployment's stable HTTPS origin if available. Vercel's first deployment may be labeled Production even when it is only a demo on a `vercel.app` address; that is not a live-shop launch.
3. Before the **live release**, set all public variables from the dedicated Shopify connection section in Vercel's **Production** environment, including `PUBLIC_SHOPIFY_MODE=live` and `PUBLIC_SITE_URL=https://kafegrohova.cz`. Keep Preview set to `demo` unless deliberately testing the real store. Store variables in Vercel project settings; `.vercelignore` excludes local environment files from CLI uploads. Environment changes require a new deployment.
4. Run the live-store checks and a Shopify test-payment walkthrough. Deploy and inspect both languages, product pages, cart, checkout and the 404 page on Vercel before attaching the public domain. The live build must succeed with the published Shopify catalog; do not use demo mode to bypass a failed release check.
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

Keep global CSS inside Tailwind layers so utilities retain their expected precedence.
