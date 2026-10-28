import api from './client';
import type { PrintedItemPreview } from './inventory.api';
import type { ItemCondition, RestorationRequestPayload } from '../types/inventory.types';

/**
 * Add item (Find item > Add item, 2026-10-22): Misfit items, added with no purchase order.
 * Server: `apps/inventory/services/add_item.py`, `apps/inventory/api_add_item.py`.
 */

export type AddItemMatch = 'tag' | 'barcode' | 'product_number' | 'model' | 'part_number' | 'text' | 'close';

export interface AddItemProduct {
  product_id: number;
  product_number: string;
  title: string;
  short_name: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  photo_url: string | null;
  /** Median sold price, else the median shelf price (see typical_price_from). */
  typical_price: string | null;
  typical_price_from: 'sold' | 'shelf' | '';
  typical_retail: string | null;
  sold: number;
  on_shelf: number;
  items: number;
  match: AddItemMatch;
  matched_sku: string;
}

export interface AddItemFindResponse {
  q: string;
  results: AddItemProduct[];
  fuzzy: boolean;
  took_ms: number;
}

export interface AddItemPriceComp {
  product_id: number;
  title: string;
  sold: number;
  typical_price: string | null;
}

export interface AddItemPrice {
  price: string | null;
  basis: '' | 'this product' | 'similar items';
  sold_count: number;
  comps: AddItemPriceComp[];
  method: '' | 'own' | 'vector' | 'title';
}

export interface TaxonomyCategory {
  name: string;
  subcategories: string[];
}

export interface AiDraft {
  title: string;
  short_name: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  retail_estimate: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface AiFillResponse {
  draft: AiDraft;
  problems: string[];
  model: string;
}

/** A product made in Add item: copied from a near match, drafted by the AI, or typed. */
export interface NewProductSpec {
  title: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  short_name?: string;
  upc?: string;
  retail_estimate?: string | null;
  how: 'copy' | 'ai' | 'typed';
  copied_from?: number;
  ai?: { model: string; draft: AiDraft };
}

export type AddItemDestination = 'floor' | 'back_stock' | 'restoration';
export type { RestorationNeed } from '../types/inventory.types';

export interface AddItemCheckInPayload {
  product_id?: number;
  new_product?: NewProductSpec;
  quantity: number;
  condition: ItemCondition;
  destination: AddItemDestination;
  price: string;
  retail?: string;
  /** 'estimate' when the retail came from the AI or a similar product and was not changed: it is asked about. */
  retail_source?: 'typed' | 'estimate';
  retail_check?: 'confirm' | 'fix' | 'none';
  notes?: string;
  restoration?: RestorationRequestPayload;
}

export interface AddItemCheckInResult {
  product_id: number;
  purchase_order_id: number;
  order_number: string;
  created_count: number;
  created_item_ids: number[];
  skus: string[];
  item_check_in_id: number | null;
  restoration_job_id: number | null;
  printed_items_preview: PrintedItemPreview[];
}

export function findAddItemProducts(q: string, signal?: AbortSignal) {
  return api.get<AddItemFindResponse>('/inventory/add-item/find/', { params: { q }, signal }).then((r) => r.data);
}

export function getAddItemPrice(params: { product?: number; title?: string; category?: string }, signal?: AbortSignal) {
  return api.get<AddItemPrice>('/inventory/add-item/price/', { params, signal }).then((r) => r.data);
}

export function getAddItemTaxonomy() {
  return api.get<{ categories: TaxonomyCategory[] }>('/inventory/add-item/taxonomy/').then((r) => r.data.categories);
}

export function aiFillProduct(title: string, photo?: File | null) {
  const form = new FormData();
  form.append('title', title);
  if (photo) form.append('photo', photo);
  return api.post<AiFillResponse>('/inventory/add-item/ai-fill/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90_000,
  }).then((r) => r.data);
}

/** Check in Misfit items. A photo goes with a new product (kept on the product). Throws a 409 for the retail check. */
export function addItemCheckIn(payload: AddItemCheckInPayload, photo?: File | null) {
  if (!photo) return api.post<AddItemCheckInResult>('/inventory/add-item/check-in/', payload).then((r) => r.data);
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  form.append('photo', photo);
  return api.post<AddItemCheckInResult>('/inventory/add-item/check-in/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
}
