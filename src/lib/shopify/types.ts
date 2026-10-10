export interface Money {
  amount: string;
  currencyCode: string;
}

export interface ShopImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface Variant {
  id: string;
  title: string;
  availableForSale: boolean;
  /** null when the store has not granted unauthenticated_read_product_inventory */
  quantityAvailable: number | null;
  price: Money;
  compareAtPrice: Money | null;
  selectedOptions: SelectedOption[];
  image: ShopImage | null;
  /** Course metafields, parsed off the variant when present */
  startsAt: string | null;
  endsAt: string | null;
}

export interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productType: string;
  /** Shopify's native gift-card identity, never inferred from tags or title. */
  isGiftCard: boolean;
  tags: string[];
  availableForSale: boolean;
  featuredImage: ShopImage | null;
  images: ShopImage[];
  options: ProductOption[];
  variants: Variant[];
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  /** Course-only metafields */
  course: CourseMeta | null;
}

export interface CourseMeta {
  durationMinutes: number | null;
  capacity: number | null;
  level: string | null;
  /** Bullet list rendered under "what you will learn" */
  syllabus: string[];
}

export interface Collection {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopImage | null;
  products: Product[];
}

export interface Article {
  id: string;
  handle: string;
  title: string;
  excerpt: string;
  excerptHtml: string;
  contentHtml: string;
  publishedAt: string;
  image: ShopImage | null;
  authorName: string | null;
  tags: string[];
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandiseId: string;
  productTitle: string;
  variantTitle: string;
  productHandle: string;
  isGiftCard: boolean;
  /** Present for course lines; null means required scheduling data is missing. */
  courseStartsAt?: string | null;
  image: ShopImage | null;
  unitPrice: Money;
  totalAmount: Money;
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: Money;
  lines: CartLine[];
}
