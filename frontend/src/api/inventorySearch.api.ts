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
  /** Typical retail of this product's items. */
  retail: string | null;
  /** The shelf price, and the sold price, as a whole percent of retail (null when there is no retail). */
  price_pct_of_retail: number | null;
  sold_pct_of_retail: number | null;
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

/** A search row plus how close it is in meaning (0 to 1). */
export type SimilarProductRow = InventorySearchRow & { similarity: number | null };

export function getSimilarProducts(productId: number, signal?: AbortSignal) {
  return api.get<{ product_id: number; results: SimilarProductRow[] }>('/inventory/search/similar/', {
    params: { product: productId },
    signal,
  });
}

// ── Bulk price change and bulk tag reprint ─────────────────────────────────────

export type BulkPriceMode = 'set' | 'percent_off' | 'amount_off';
export type BulkPriceRounding = 'none' | '99' | 'dollar';

export interface BulkPriceRule {
  mode: BulkPriceMode;
  value: string;
  round: BulkPriceRounding;
}

/** What is selected: single items, and whole products (every shelf item of each). */
export interface BulkSelection {
  item_ids: number[];
  product_ids: number[];
}

/** One item in a bulk change (or a reprint): the prices and what its tag needs. */
export interface BulkPriceItem {
  id: number;
  sku: string;
  old: string;
  new: string;
  title: string;
  brand: string;
  product_number: string;
}

export interface BulkPricePreview {
  describe: string;
  selected: number;
  over_cap: boolean;
  cap: number;
  count: number;
  unchanged: number;
  total_before: string;
  total_after: string;
  at_floor: number;
  sample: BulkPriceItem[];
}

export interface BulkPriceChange {
  id: number;
  description: string;
  item_count: number;
  total_before: string;
  total_after: string;
  created_at: string;
  created_by: string;
  undone_at: string | null;
  undone_by: string;
  undo_result: { restored: number; left_alone: number } | null;
  items?: BulkPriceItem[];
}

export function previewBulkPrice(selection: BulkSelection, rule: BulkPriceRule, signal?: AbortSignal) {
  return api.post<BulkPricePreview>('/inventory/bulk-price/preview/', { ...selection, rule }, { signal });
}

export function applyBulkPrice(selection: BulkSelection, rule: BulkPriceRule) {
  return api.post<BulkPriceChange>('/inventory/bulk-price/apply/', { ...selection, rule });
}

export function getBulkPriceChanges() {
  return api.get<{ results: BulkPriceChange[] }>('/inventory/bulk-price/');
}

export function getBulkPriceChange(id: number) {
  return api.get<BulkPriceChange>(`/inventory/bulk-price/${id}/`);
}

export function undoBulkPrice(id: number) {
  return api.post<BulkPriceChange>(`/inventory/bulk-price/${id}/undo/`);
}

export function getBulkLabels(selection: BulkSelection) {
  return api.post<{ count: number; over_cap: boolean; items: BulkPriceItem[] }>('/inventory/bulk-price/labels/', selection);
}
