# Kafe Grohova — headless webshop

Astro storefront for [Kafe Grohova](https://kafegrohova.cz): barista course
bookings and merchandise, backed by Shopify through the Storefront API.

The visual design is ported from the legacy Next.js app
(`kafegrohova-webapp-next`) — same palette, same typeface, same layouts. Only
the public-facing pages came across; the MongoDB admin, auth and Stripe
checkout are gone, replaced by Shopify.

```
Astro 5 (static)  ·  Tailwind v4  ·  Shopify Storefront API  ·  cs / en
```

---

## Quick start

```bash
npm install
cp .env.example .env      # optional — see "Mock mode" below
npm run dev               # http://localhost:4321
```

`npm run build` produces a fully static `dist/` you can drop on Netlify,
Vercel, Cloudflare Pages, or any static host.

### Mock mode

With no Shopify credentials set, the site runs against fixtures in
`src/lib/shopify/mock.ts`: three barista courses with rolling future dates,
eight merch products and four blog posts. Every page renders, the cart works,
and only the final checkout redirect is disabled. A small `DEMO` banner marks
the state.

That means you can develop and review the entire storefront before the Shopify
store exists — which is exactly how it was built.

---

## Connecting Shopify

### 1. Create the Storefront API app

Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an
app** → **Configuration → Storefront API** and enable:

| Scope | Why |
| --- | --- |
| `unauthenticated_read_product_listings` | products and collections |
| `unauthenticated_read_product_inventory` | **required** — seat counts on courses |
| `unauthenticated_read_content` | blog articles |
| `unauthenticated_write_checkouts` | cart mutations |
| `unauthenticated_read_checkouts` | reading the cart back |

Install the app and copy the Storefront API access token.

> The Storefront token is designed to be public — it ships in the browser
> bundle for cart operations. Never put an **Admin** API token in this project.

### 2. Fill in `.env`

```dotenv
PUBLIC_SHOPIFY_STORE_DOMAIN=kafe-grohova.myshopify.com
PUBLIC_SHOPIFY_STOREFRONT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_SHOPIFY_COURSES_COLLECTION=barista-kurzy
PUBLIC_SHOPIFY_MERCH_COLLECTION=merch
PUBLIC_SHOPIFY_BLOG_HANDLE=news
```

The moment both the domain and token are present, mock mode switches off and
every page pulls live data.

### 3. Model the barista courses

**One product per course. One variant per date. Inventory = seats.**

That is the whole booking system — Shopify handles seat counts, payment,
overselling and sold-out states, with no scheduling app and no extra cost.

For each course product:

- Put it in the `barista-kurzy` collection.
- Set **Product type** to `Course` (or tag it `course`).
- Add an option named **Termín** / **Date**, one value per session,
  e.g. `28. srpna v 10:00`.
- For every variant: **Track quantity** on, quantity = number of seats,
  and leave *Continue selling when out of stock* **off**.

Optional metafields make the course pages richer:

| Namespace / key | Type | Renders as |
| --- | --- | --- |
| `course.duration_minutes` | integer | "Délka: 4 h" |
| `course.capacity` | integer | "Kapacita: max 4" |
| `course.level` | single line text | "Úroveň: Začátečník" |
| `course.syllabus` | list of single line text | the "Co se naučíte" list |
| `course.starts_at` *(variant)* | date and time | formatted date on the picker |
| `course.ends_at` *(variant)* | date and time | reserved for calendar export |

Without `starts_at` the picker falls back to the variant title, so the
metafields are a nice-to-have rather than a requirement.

When a customer books, the variant is added to a Shopify cart and they check
out on Shopify's hosted checkout. The order arrives in your admin with the
course and date as the line item, and the seat count decrements automatically.

### 4. Merchandise

Anything in the `merch` collection shows up in the store. If that collection
does not exist, the site falls back to all products minus the courses.

### 5. Translations

Czech is the default locale and lives at `/cs/`; English at `/en/`. Queries use
`@inContext(language:)`, so install Shopify's free **Translate & Adapt** app and
translate titles and descriptions there — the storefront picks them up with no
code change.

---

## Project layout

```
src/
├── components/
│   ├── AddToCart.astro       variant picker + quantity + add button
│   ├── CartDrawer.astro       slide-over cart, checkout hand-off
│   ├── CourseBooking.astro    date picker with seats remaining
│   ├── CourseCard.astro       course summary with next dates
│   ├── Footer.astro
│   ├── Navbar.astro
│   ├── ProductCard.astro
│   └── SplitFeature.astro     the half-image / half-text band
├── i18n/                      cs + en strings and routing helpers
├── layouts/BaseLayout.astro   head, nav, footer, cart, SEO, hreflang
├── lib/
│   ├── cart.ts                browser cart store (Shopify or mock)
│   └── shopify/
│       ├── client.ts          Storefront GraphQL fetch
│       ├── config.ts          env resolution, isMockMode
│       ├── index.ts           public data API + formatters
│       ├── mock.ts            fixtures for mock mode
│       ├── normalize.ts       GraphQL -> app types
│       ├── queries.ts         GraphQL documents
│       └── types.ts
├── pages/[lang]/
│   ├── index.astro            home
│   ├── store/                 merch listing + product detail
│   ├── courses/               course listing + booking page
│   ├── blog/                  article listing + article
│   └── contact.astro
└── styles/global.css          design tokens, base + component layers
```

### A note on `global.css`

Every base rule lives inside `@layer base` / `@layer components`. This is not
cosmetic: in Tailwind v4, unlayered CSS beats layered utilities, so a bare
`img { height: auto }` silently defeats every `h-*` class on an image. Keep new
global rules inside a layer.

---

## Routing

| Path | Page |
| --- | --- |
| `/` | redirects to `/cs/` |
| `/cs/`, `/en/` | home |
| `/{lang}/store` | merchandise |
| `/{lang}/store/{handle}` | product detail |
| `/{lang}/courses` | course listing with upcoming dates |
| `/{lang}/courses/{handle}` | course detail and booking |
| `/{lang}/blog`, `/{lang}/blog/{handle}` | blog |
| `/{lang}/contact` | contact |

Product, course and article pages are generated at build time. Add a product in
Shopify → rebuild to publish it; a deploy hook on Shopify's
`products/update` webhook automates that.

---

## Images

`public/` holds the photography carried over from the legacy app, re-encoded to
max 2000px WebP — 47 MB became 4 MB. To re-run after adding new photos:

```bash
node scripts/optimize-images.mjs
```

Product and article images served from Shopify's CDN are resized through
Shopify's own transform parameters (`src/lib/shopify/index.ts` → `imageUrl`),
so nothing needs to live in this repo.

---

## Known gaps

- **Contact form** composes a `mailto:` draft — there is no server in a static
  build. Point it at Formspree, Basin or a serverless function when you want
  submissions to land in an inbox automatically.
- **Blog subscribe** button links to the contact page rather than a mailing
  list provider.
- **Course reminders / calendar invites** are not built. The natural place is a
  Shopify Flow automation on order creation, or a `course.starts_at`-driven ICS
  attachment.
- **Attendee names** are not collected per seat; the buyer's details come from
  the Shopify checkout. If you need names, add cart line-item attributes in
  `src/lib/cart.ts`.
