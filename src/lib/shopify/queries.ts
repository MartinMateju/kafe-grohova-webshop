export const IMAGE_FRAGMENT = /* GraphQL */ `
  fragment ImageFields on Image {
    url
    altText
    width
    height
  }
`;

export const VARIANT_FRAGMENT = /* GraphQL */ `
  fragment VariantFields on ProductVariant {
    id
    title
    availableForSale
    quantityAvailable
    price {
      amount
      currencyCode
    }
    compareAtPrice {
      amount
      currencyCode
    }
    selectedOptions {
      name
      value
    }
    image {
      ...ImageFields
    }
    startsAt: metafield(namespace: "course", key: "starts_at") {
      value
    }
    endsAt: metafield(namespace: "course", key: "ends_at") {
      value
    }
  }
`;

export const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    descriptionHtml
    productType
    isGiftCard
    tags
    availableForSale
    featuredImage {
      ...ImageFields
    }
    images(first: 12) {
      nodes {
        ...ImageFields
      }
    }
    options {
      id
      name
      values
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    variants(first: 50) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ...VariantFields
      }
    }
    courseDuration: metafield(namespace: "course", key: "duration_minutes") {
      value
    }
    courseCapacity: metafield(namespace: "course", key: "capacity") {
      value
    }
    courseLevel: metafield(namespace: "course", key: "level") {
      value
    }
    courseSyllabus: metafield(namespace: "course", key: "syllabus") {
      value
    }
  }
`;

export const COLLECTION_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  ${PRODUCT_FRAGMENT}
  query CollectionByHandle(
    $handle: String!
    $first: Int!
    $after: String
    $language: LanguageCode
  ) @inContext(language: $language, country: CZ) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        ...ImageFields
      }
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          ...ProductFields
        }
      }
    }
  }
`;

export const PRODUCT_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  ${PRODUCT_FRAGMENT}
  query ProductByHandle($handle: String!, $language: LanguageCode)
  @inContext(language: $language, country: CZ) {
    product(handle: $handle) {
      ...ProductFields
    }
  }
`;

export const PRODUCT_VARIANTS_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  query ProductVariants($handle: String!, $after: String, $language: LanguageCode)
  @inContext(language: $language, country: CZ) {
    product(handle: $handle) {
      variants(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...VariantFields }
      }
    }
  }
`;

export const ALL_PRODUCTS_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  ${PRODUCT_FRAGMENT}
  query AllProducts($first: Int!, $after: String, $language: LanguageCode)
  @inContext(language: $language, country: CZ) {
    products(first: $first, after: $after, sortKey: BEST_SELLING) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ...ProductFields
      }
    }
  }
`;

export const ARTICLES_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  query Articles($handle: String!, $first: Int!, $after: String, $language: LanguageCode)
  @inContext(language: $language) {
    blog(handle: $handle) {
      articles(first: $first, after: $after, sortKey: PUBLISHED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          excerpt
          excerptHtml
          contentHtml
          publishedAt
          tags
          authorV2 {
            name
          }
          image {
            ...ImageFields
          }
        }
      }
    }
  }
`;

export const ARTICLE_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  query Article($blogHandle: String!, $handle: String!, $language: LanguageCode)
  @inContext(language: $language) {
    blog(handle: $blogHandle) {
      articleByHandle(handle: $handle) {
        id
        handle
        title
        excerpt
        excerptHtml
        contentHtml
        publishedAt
        tags
        authorV2 {
          name
        }
        image {
          ...ImageFields
        }
      }
    }
  }
`;

/* ------------------------------------------------------------------ cart -- */

export const CART_FRAGMENT = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
    }
    lines(first: 250) {
      pageInfo { hasNextPage }
      nodes {
        id
        quantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
          amountPerQuantity {
            amount
            currencyCode
          }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            startsAt: metafield(namespace: "course", key: "starts_at") { value }
            image {
              url
              altText
              width
              height
            }
            product {
              title
              handle
              productType
              isGiftCard
              tags
              courseDuration: metafield(namespace: "course", key: "duration_minutes") { value }
            }
          }
        }
      }
    }
  }
`;

export const CART_CREATE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartCreate($lines: [CartLineInput!], $language: LanguageCode)
  @inContext(language: $language) {
    cartCreate(input: { lines: $lines, buyerIdentity: { countryCode: CZ } }) {
      cart {
        ...CartFields
      }
      userErrors {
        code
        field
        message
      }
      warnings { code message target }
    }
  }
`;

export const CART_QUERY = /* GraphQL */ `
  ${CART_FRAGMENT}
  query CartQuery($id: ID!, $language: LanguageCode)
  @inContext(language: $language) {
    cart(id: $id) {
      ...CartFields
    }
  }
`;

export const CART_LINES_ADD = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!, $language: LanguageCode)
  @inContext(language: $language) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        code
        field
        message
      }
      warnings { code message target }
    }
  }
`;

export const CART_LINES_UPDATE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!, $language: LanguageCode)
  @inContext(language: $language) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        code
        field
        message
      }
      warnings { code message target }
    }
  }
`;

export const CART_LINES_REMOVE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!, $language: LanguageCode)
  @inContext(language: $language) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      userErrors {
        code
        field
        message
      }
      warnings { code message target }
    }
  }
`;
