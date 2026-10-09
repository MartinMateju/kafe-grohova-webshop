import {
  STOREFRONT_ENDPOINT,
  SHOPIFY_TOKEN,
  isMockMode,
} from './config';

export class ShopifyError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

/**
 * Minimal Storefront API client. Works in Node (build time) and in the
 * browser (cart island) — both have fetch.
 */
export async function storefront<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (isMockMode) {
    throw new ShopifyError(
      'Shopify is not configured. Set PUBLIC_SHOPIFY_STORE_DOMAIN and PUBLIC_SHOPIFY_STOREFRONT_TOKEN.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(STOREFRONT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ShopifyError(
        `Storefront API responded ${response.status} ${response.statusText}`,
        body.slice(0, 500),
      );
    }

    let json: GraphQLResponse<T>;
    try {
      json = (await response.json()) as GraphQLResponse<T>;
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      throw new ShopifyError('Storefront API returned an invalid JSON response', cause);
    }
    if (json?.errors?.length) {
      throw new ShopifyError(
        json.errors.map((e) => e.message).join('; '),
        json.errors,
      );
    }
    if (!json?.data) throw new ShopifyError('Storefront API returned no data');
    return json.data;
  } catch (cause) {
    if (cause instanceof ShopifyError) throw cause;
    throw new ShopifyError(
      controller.signal.aborted
        ? 'The Shopify Storefront API request timed out. Please try again.'
        : 'Could not reach the Shopify Storefront API',
      cause,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Demo fallback only. A failed live query must fail the build, otherwise a
 * bad token or Shopify outage can silently publish an empty catalog.
 */
export async function storefrontSafe<T>(
  query: string,
  variables: Record<string, unknown> = {},
  fallback: T,
): Promise<T> {
  if (isMockMode) return fallback;
  return storefront<T>(query, variables);
}
