/** Public Storefront configuration shared by Astro builds and the browser cart. */
type Env = Record<string, string | undefined>;

function readEnv(): Env {
  // import.meta.env is populated in both Astro SSR/build and client bundles.
  const meta = (import.meta as unknown as { env?: Env }).env ?? {};
  // process.env is available when scripts run outside Vite (e.g. astro.config).
  const proc =
    typeof process !== 'undefined' && process.env ? (process.env as Env) : {};
  return { ...proc, ...meta };
}

export function resolveShopifyConfig(env: Env) {
  const mode = (env.PUBLIC_SHOPIFY_MODE || 'auto').trim();
  if (!['auto', 'demo', 'live'].includes(mode)) {
    throw new Error('PUBLIC_SHOPIFY_MODE must be auto, demo, or live.');
  }
  const domain = (env.PUBLIC_SHOPIFY_STORE_DOMAIN || '')
    .trim().replace(/^https:\/\//i, '').replace(/\/$/, '').toLowerCase();
  const token = (env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN || '').trim();
  const apiVersion = (env.PUBLIC_SHOPIFY_API_VERSION || '2026-07').trim();
  const placeholder = !domain || domain === 'your-store.myshopify.com';
  const isMockMode = mode === 'demo' || (mode === 'auto' && placeholder && !token);

  if (/^shp(?:at|ca|pa|ss|ua)_/i.test(token)) {
    throw new Error('PUBLIC_SHOPIFY_STOREFRONT_TOKEN must be a PUBLIC Storefront API token from the Headless channel. Never use an Admin API or private token.');
  }
  if (!isMockMode) {
    if (placeholder || !token) {
      throw new Error('Shopify live mode requires both PUBLIC_SHOPIFY_STORE_DOMAIN and PUBLIC_SHOPIFY_STOREFRONT_TOKEN. Use PUBLIC_SHOPIFY_MODE=demo for local fixtures.');
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
      throw new Error('PUBLIC_SHOPIFY_STORE_DOMAIN must be your permanent shop-name.myshopify.com domain.');
    }
    if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
      throw new Error('PUBLIC_SHOPIFY_API_VERSION must pin a stable quarterly version, for example 2026-07.');
    }
  }
  return {
    domain, token, apiVersion, isMockMode,
    merchEnabled: env.PUBLIC_MERCH_ENABLED?.trim() === 'true',
    endpoint: isMockMode ? '' : `https://${domain}/api/${apiVersion}/graphql.json`,
  };
}

const env = readEnv();
const config = resolveShopifyConfig(env);
/** Merchandise and gift cards stay hidden until explicitly restored. */
export const MERCH_ENABLED = config.merchEnabled;
export const SHOPIFY_DOMAIN = config.domain;
export const SHOPIFY_TOKEN = config.token;
export const SHOPIFY_API_VERSION = config.apiVersion;
/** Both site languages serve the Czech market. */
export const SHOPIFY_COUNTRY = 'CZ';

export const COURSES_COLLECTION = (
  env.PUBLIC_SHOPIFY_COURSES_COLLECTION || 'barista-kurzy'
).trim();
export const MERCH_COLLECTION = (
  env.PUBLIC_SHOPIFY_MERCH_COLLECTION || 'merch'
).trim();
export const BLOG_HANDLE = (env.PUBLIC_SHOPIFY_BLOG_HANDLE || 'news').trim();

export const SITE_URL = (env.PUBLIC_SITE_URL || 'https://kafegrohova.cz').trim();

export const isMockMode = config.isMockMode;
export const STOREFRONT_ENDPOINT = config.endpoint;
