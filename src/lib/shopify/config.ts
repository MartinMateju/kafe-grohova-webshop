/**
 * Central place where the Shopify connection is resolved.
 *
 * Every value is read from PUBLIC_* env vars so the same configuration is
 * available at build time (Astro pages) and in the browser (cart island).
 * When the domain or token is missing the whole storefront transparently
 * falls back to the fixtures in ./mock.ts — see isMockMode below.
 */

type Env = Record<string, string | undefined>;

function readEnv(): Env {
  // import.meta.env is populated in both Astro SSR/build and client bundles.
  const meta = (import.meta as unknown as { env?: Env }).env ?? {};
  // process.env is available when scripts run outside Vite (e.g. astro.config).
  const proc =
    typeof process !== 'undefined' && process.env ? (process.env as Env) : {};
  return { ...proc, ...meta };
}

const env = readEnv();

export const SHOPIFY_DOMAIN = (env.PUBLIC_SHOPIFY_STORE_DOMAIN || '').trim();
export const SHOPIFY_TOKEN = (env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN || '').trim();
export const SHOPIFY_API_VERSION = (
  env.PUBLIC_SHOPIFY_API_VERSION || '2025-07'
).trim();

export const COURSES_COLLECTION = (
  env.PUBLIC_SHOPIFY_COURSES_COLLECTION || 'barista-kurzy'
).trim();
export const MERCH_COLLECTION = (
  env.PUBLIC_SHOPIFY_MERCH_COLLECTION || 'merch'
).trim();
export const BLOG_HANDLE = (env.PUBLIC_SHOPIFY_BLOG_HANDLE || 'news').trim();

export const SITE_URL = (env.PUBLIC_SITE_URL || 'https://kafegrohova.cz').trim();

/**
 * True when no usable Shopify credentials are configured. In mock mode the
 * site still builds and every page renders, backed by local fixtures, and the
 * cart refuses to redirect to a checkout that does not exist.
 */
export const isMockMode =
  !SHOPIFY_DOMAIN ||
  !SHOPIFY_TOKEN ||
  SHOPIFY_DOMAIN === 'your-store.myshopify.com';

export const STOREFRONT_ENDPOINT = isMockMode
  ? ''
  : `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
