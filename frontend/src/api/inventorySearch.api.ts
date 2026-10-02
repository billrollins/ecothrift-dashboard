import api from './client';

/** One row of Inventory search: a product with the numbers people search for. */
export interface InventorySearchRow {
  product_id: number;
  product_number: string;
  title: string;
  original_title: string;
  tag_name: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  specs: Record<string, string>;
  upc: string;
  items: number;
  on_shelf: number;
  price_min: string | null;
  price_max: string | null;
  sold: number;
  avg_sold: string | null;
  avg_days_to_sell: number | null;
  last_sold_at: string | null;
  matched_sku: string;
}

export interface InventorySearchResponse {
  q: string;
  page: number;
  page_size: number;
  count: number;
  more: boolean;
  fuzzy: boolean;
  results: InventorySearchRow[];
  took_ms: number;
}

export interface InventorySearchItem {
  id: number;
  sku: string;
  price: string | null;
  retail: string | null;
  status: string;
  condition: string;
  location: string;
  check_in_id: number | null;
  purchase_order_id: number | null;
  order_number: string;
  checked_in_at: string | null;
  listed_at: string | null;
  sold_at: string | null;
  sold_for: string | null;
  label_printed_at: string | null;
}

export interface InventorySearchItemsResponse {
  product_id: number;
  count: number;
  items: InventorySearchItem[];
}

export function searchInventory(params: { q: string; sold: boolean; page: number }, signal?: AbortSignal) {
  return api.get<InventorySearchResponse>('/inventory/search/', {
    params: { q: params.q, sold: params.sold ? 1 : undefined, page: params.page },
    signal,
  });
}

export function getProductItems(productId: number, sold: boolean, signal?: AbortSignal) {
  return api.get<InventorySearchItemsResponse>('/inventory/search/items/', {
    params: { product: productId, sold: sold ? 1 : undefined },
    signal,
  });
}
