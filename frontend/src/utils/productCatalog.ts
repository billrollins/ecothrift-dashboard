import type { Product } from '../types/inventory.types';

/** Structured Product identity for styled rendering in search/autocomplete. */
export interface ProductDisplayParts {
  productNumber: string;
  brand: string;
  title: string;
  primaryIdentifier: string;
}

export type ProductLike = Pick<
  Product,
  'id' | 'product_number' | 'brand' | 'title' | 'identifiers' | 'upc' | 'catalog_display_label'
>;

export const PRODUCT_SEARCH_MIN_CHARS = 2;
export const PRODUCT_SEARCH_DEFAULT_PAGE_SIZE = 25;

/** Universal display parts — mirror of Product.catalog_display_parts on the backend. */
export function productDisplayParts(product: ProductLike): ProductDisplayParts {
  const productNumber = product.product_number?.trim() || `PRD-${product.id}`;
  return {
    productNumber,
    brand: (product.brand || '').trim(),
    title: (product.title || '').trim(),
    primaryIdentifier: product.identifiers?.upc?.trim() || product.upc?.trim() || '',
  };
}

/** Plain-text fallback when a single string is enough (logs, confirms, aria). */
export function productDisplayLabel(product: ProductLike): string {
  if (product.catalog_display_label?.trim()) return product.catalog_display_label.trim();
  const parts = productDisplayParts(product);
  if (parts.brand && parts.brand.toLowerCase() !== 'generic') {
    return `${parts.productNumber} · ${parts.brand} ${parts.title}`;
  }
  return `${parts.productNumber} · ${parts.title}`;
}

/** Params for the universal product quick-search API call. */
export function productSearchParams(query: string, pageSize = PRODUCT_SEARCH_DEFAULT_PAGE_SIZE) {
  const trimmed = query.trim();
  return {
    search: trimmed || undefined,
    page_size: pageSize,
  };
}

/** Search string to surface a product in Manage Products after create. */
export function productManageCatalogSearchTerm(product: ProductLike & { title?: string }): string {
  const productNumber = product.product_number?.trim();
  if (productNumber) return productNumber;
  const title = (product.title || '').trim();
  if (title.length >= PRODUCT_SEARCH_MIN_CHARS) return title;
  if (title) return title;
  return `PRD-${product.id}`;
}
