# Demo catalog and Shopify import

The storefront and export share `data/demo-catalog.json`: three courses with eight sessions, seven retained physical products with thirteen variants, one demo gift card with three correctly priced denominations, and four sample articles in Czech and English. Cupping replaces the previous espresso course. Physical merchandise is temporarily hidden by `PUBLIC_MERCH_ENABLED=false`; gift cards are independently visible with `PUBLIC_GIFT_CARDS_ENABLED=true`. Prices, stock, dates, weights, descriptions and articles are examples to replace before selling.

Course dates roll forward when the local demo starts or builds, using Prague time including daylight saving. A deployed static build keeps its generated dates until rebuilt. Exported dates stay fixed; regenerate just before a fresh import.

## Generate the files

```sh
node scripts/generate-demo-catalog.mjs --courses-only
```

This produces `data/shopify/products.csv`, `course-metafields.json` and `images.json`. The checked-in sample contains only courses and uses **2026-10-10** as its base date. Reproduce it with:

```sh
node scripts/generate-demo-catalog.mjs --courses-only --date 2026-10-10 --image-base https://kafe-grohova-webshop.vercel.app
```

Use `--lang en --out data/shopify-en` for an English catalog. Import only one language version; it is not a translation import. Use the bilingual source as copy for Shopify translations. If this project's `public/` assets are already hosted, include them with `--image-base https://your-public-site.example`. Without that option the CSV has no image columns; `images.json` lists the local files to upload.

## Import and connect

1. Use a development store with **CZK** currency. Import `products.csv` through **Products → Import**. Keep overwrite off. Every item is tagged `demo`, titled `[DEMO]`, unpublished and draft.
2. Review the import preview. The course-only file contains three courses and eight variants. Without `--courses-only`, the full export includes ten products and twenty-one variants; native gift cards are always excluded.
3. Confirm the collection handle `barista-kurzy`; `merch` is only needed after restoring merchandise. CSV quantity is for a single location; for multiple locations, assign stock separately using Shopify's inventory workflow. Course inventory represents seats, shipping is off, and overselling is disabled. Beginner latte art has capacity 2, cupping 4, and filtered coffee 4. Each variant's inventory must be no higher than its course capacity. For existing bookings, subtract already-sold seats instead of resetting inventory to full capacity.
4. Add photographs using `images.json`, or regenerate with publicly accessible HTTPS image URLs. Localhost images cannot be fetched by Shopify.
5. Create the product/variant custom-data definitions below, enable public Storefront API read access (`PUBLIC_READ`), and copy matching values from `course-metafields.json`. That JSON is a reference, not an import format. Match each date to its stable `DEMO-…` SKU. A date option label may display without metafields, but booking remains disabled until `course.starts_at` contains a valid future timestamp with timezone.
6. Set the reviewed products active and publish products **and collections** to the Headless storefront. Supply the store domain and public Storefront token using `.env.example`, then rebuild. Test checkout with Shopify test payments.

| Owner | Namespace and key | Type |
| --- | --- | --- |
| Product | `course.duration_minutes`, `course.capacity` | `number_integer` |
| Product | `course.level` | `single_line_text_field` |
| Product | `course.syllabus` | `list.single_line_text_field` |
| Variant | `course.starts_at`, `course.ends_at` | `date_time` |

Create a native Shopify gift-card product separately with **1000, 2000 and 3000 CZK** denominations and handle `darkovy-poukaz`, then publish it to Headless. No merchandise collection is required. The local gift card demonstrates denomination selection and cart pricing; the public sample PDF is not redeemable. See the README's gift-card section for fulfillment checks and replacing the PDF/image. Sample articles are local fixtures; add or replace them under the configured Shopify blog when switching to live data.

Do not repeatedly overwrite purchased course dates with a freshly generated schedule: changing option values replaces variant IDs. Use real sessions before taking orders. Demo exports deliberately leave tax settings to the store; review applicable taxes and replace sample shipping weights before launch.

Shopify's [current CSV specification](https://help.shopify.com/en/manual/products/import-export/using-csv) documents the column names, UTF-8/LF format, image URL requirements, inventory/location limits, unavailable variant-metafield imports, and native gift-card restriction. See also [product imports](https://help.shopify.com/en/manual/products/import-export/import-products) for the admin import workflow. No live Shopify data is created by this generator.
