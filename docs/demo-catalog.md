# Demo catalog and Shopify import

The storefront and export share `data/demo-catalog.json`: three courses with nine sessions, seven physical products with thirteen variants, one demo gift card with three correctly priced denominations, and four sample articles in Czech and English. Prices, stock, dates, weights, descriptions and articles are examples to replace before selling.

Course dates roll forward when the local demo starts or builds, using Prague time including daylight saving. A deployed static build keeps its generated dates until rebuilt. Exported dates stay fixed; regenerate just before a fresh import.

## Generate the files

```sh
node scripts/generate-demo-catalog.mjs
```

This produces `data/shopify/products.csv`, `course-metafields.json` and `images.json`. The checked-in sample uses **2026-10-09** as its base date. Reproduce it with:

```sh
node scripts/generate-demo-catalog.mjs --date 2026-10-09
```

Use `--lang en --out data/shopify-en` for an English catalog. Import only one language version; it is not a translation import. Use the bilingual source as copy for Shopify translations. If this project's `public/` assets are already hosted, include them with `--image-base https://your-public-site.example`. Without that option the CSV has no image columns; `images.json` lists the local files to upload.

## Import and connect

1. Use a development store with **CZK** currency. Import `products.csv` through **Products → Import**. Keep overwrite off. Every item is tagged `demo`, titled `[DEMO]`, unpublished and draft.
2. Review the import preview. The file contains ten products and twenty-two variants; native gift cards are excluded.
3. Confirm collection handles `barista-kurzy` and `merch`. CSV quantity is for a single location; for multiple locations, assign stock separately using Shopify's inventory workflow. Course inventory represents seats, shipping is off, and overselling is disabled.
4. Add photographs using `images.json`, or regenerate with publicly accessible HTTPS image URLs. Localhost images cannot be fetched by Shopify.
5. Create the product/variant custom-data definitions below, enable public Storefront API read access (`PUBLIC_READ`), and copy matching values from `course-metafields.json`. That JSON is a reference, not an import format. Match each date to its stable `DEMO-…` SKU. A date option label may display without metafields, but booking remains disabled until `course.starts_at` contains a valid future timestamp with timezone.
6. Set the reviewed products active and publish products **and collections** to the Headless storefront. Supply the store domain and public Storefront token using `.env.example`, then rebuild. Test checkout with Shopify test payments.

| Owner | Namespace and key | Type |
| --- | --- | --- |
| Product | `course.duration_minutes`, `course.capacity` | `number_integer` |
| Product | `course.level` | `single_line_text_field` |
| Product | `course.syllabus` | `list.single_line_text_field` |
| Variant | `course.starts_at`, `course.ends_at` | `date_time` |

Create a native Shopify gift-card product separately with **1000, 2000 and 3000 CZK** denominations, handle `darkovy-poukaz`, and add it to `merch`. The local gift card only demonstrates cart pricing. Sample articles are local fixtures; add or replace them under the configured Shopify blog when switching to live data.

Do not repeatedly overwrite purchased course dates with a freshly generated schedule: changing option values replaces variant IDs. Use real sessions before taking orders. Demo exports deliberately leave tax settings to the store; review applicable taxes and replace sample shipping weights before launch.

Shopify's [current CSV specification](https://help.shopify.com/en/manual/products/import-export/using-csv) documents the column names, UTF-8/LF format, image URL requirements, inventory/location limits, unavailable variant-metafield imports, and native gift-card restriction. See also [product imports](https://help.shopify.com/en/manual/products/import-export/import-products) for the admin import workflow. No live Shopify data is created by this generator.
