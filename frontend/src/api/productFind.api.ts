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
}

export interface FoundProductsDTO {
  q?: string;
  results: FoundProductDTO[];
  took_ms: number;
}

/** The products a row most likely is, closest first; products already on the row are left out. */
export function getLikelyProducts(processingRowId: number): Promise<{ data: FoundProductsDTO }> {
  return api.get<FoundProductsDTO>(`/inventory/processing-rows/${processingRowId}/likely-products/`);
}

/** Words or a code -> ranked products; the row's own products come back marked. */
export function findProducts(q: string, processingRowId?: number): Promise<{ data: FoundProductsDTO }> {
  return api.get<FoundProductsDTO>('/inventory/product-find/', { params: { q, row: processingRowId } });
}
