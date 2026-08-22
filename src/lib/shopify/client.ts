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

  let response: Response;
  try {
    response = await fetch(STOREFRONT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new ShopifyError('Could not reach the Shopify Storefront API', cause);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ShopifyError(
      `Storefront API responded ${response.status} ${response.statusText}`,
      body.slice(0, 500),
    );
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    throw new ShopifyError(
      json.errors.map((e) => e.message).join('; '),
      json.errors,
    );
  }

  if (!json.data) {
    throw new ShopifyError('Storefront API returned no data');
  }

  return json.data;
}

/**
 * Build-time helper: run a query but never break the build. Pages call this so
 * a transient Shopify outage degrades to an empty section instead of a failed
 * deploy.
 */
export async function storefrontSafe<T>(
  query: string,
  variables: Record<string, unknown> = {},
  fallback: T,
): Promise<T> {
  try {
    return await storefront<T>(query, variables);
  } catch (error) {
    if (!isMockMode) {
      console.warn(
        '[shopify] query failed, falling back:',
        error instanceof Error ? error.message : error,
      );
    }
    return fallback;
  }
}
