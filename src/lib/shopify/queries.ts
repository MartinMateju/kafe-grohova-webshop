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
    variants(first: 100) {
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
    $language: LanguageCode
  ) @inContext(language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        ...ImageFields
      }
      products(first: $first) {
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
  @inContext(language: $language) {
    product(handle: $handle) {
      ...ProductFields
    }
  }
`;

export const ALL_PRODUCTS_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  ${PRODUCT_FRAGMENT}
  query AllProducts($first: Int!, $language: LanguageCode)
  @inContext(language: $language) {
    products(first: $first, sortKey: BEST_SELLING) {
      nodes {
        ...ProductFields
      }
    }
  }
`;

export const ARTICLES_QUERY = /* GraphQL */ `
  ${IMAGE_FRAGMENT}
  query Articles($handle: String!, $first: Int!, $language: LanguageCode)
  @inContext(language: $language) {
    blog(handle: $handle) {
      articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
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
    lines(first: 100) {
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
            image {
              url
              altText
              width
              height
            }
            product {
              title
              handle
            }
          }
        }
      }
    }
  }
`;

export const CART_CREATE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CART_QUERY = /* GraphQL */ `
  ${CART_FRAGMENT}
  query CartQuery($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
`;

export const CART_LINES_ADD = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CART_LINES_UPDATE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CART_LINES_REMOVE = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;
