import api from './client';

/** One product found for a manifest row (`apps/inventory/services/product_find.py`, Dash Updates #98). */
export interface FoundProductDTO {
  id: number;
  product_number: string;
  title: string;
  brand: string;
  model: string;
  upc: string;
  category: string;
  items: number;
  on_shelf: number;
  sold: number;
  avg_sold: string | null;
  last_price: string | null;
  /** Why it is in the list: Same code, All words, Most words, Close in meaning, Close spelling. */
  why: string;
  /** Already attached to this row (search results only). */
  on_this_row?: boolean;
  /** One picture for choosing it at a glance (photo-sheet photos only), or null. */
  photo?: string | null;
  /** Likely products only (#223): it IS this product, or is only LIKE it, and how sure (0 to 100). */
  kind?: 'is' | 'like';
  confidence?: number;
}

export interface FoundProductsDTO {
  q?: string;
  results: FoundProductDTO[];
  took_ms: number;
  /** Likely products only: products a person said this row is not. */
  not_product_ids?: number[];
}

/** The products a row most likely is, most sure first; products on the row or said "not this" are left out. */
export function getLikelyProducts(processingRowId: number, signal?: AbortSignal): Promise<{ data: FoundProductsDTO }> {
  return api.get<FoundProductsDTO>(`/inventory/processing-rows/${processingRowId}/likely-products/`, { signal });
}

/** Words or a code -> ranked products; the row's own products come back marked. A newer search cancels this one. */
export function findProducts(q: string, processingRowId?: number, signal?: AbortSignal): Promise<{ data: FoundProductsDTO }> {
  return api.get<FoundProductsDTO>('/inventory/product-find/', { params: { q, row: processingRowId }, signal });
}

/** The X on a likely product: this row is not that product (remembered on the row); ``undo`` takes it back. */
export function setNotProduct(processingRowId: number, productId: number, undo = false): Promise<{ data: { not_product_ids: number[] } }> {
  return api.post(`/inventory/processing-rows/${processingRowId}/not-product/`, { product_id: productId, undo });
}
