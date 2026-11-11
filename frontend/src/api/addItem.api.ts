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
  /** The AI's values, so the server records which fields were kept as the AI wrote them. */
  ai?: { model: string; draft: Partial<AiDraft> | Record<string, unknown> };
  /** Clean up with AI (#96). */
  tags?: string[];
  identifiers?: Record<string, string>;
  specifications?: Record<string, string>;
  /** "Anything you know about it", kept as typed on the check-in record. */
  source_text?: string;
}

/** Clean up with AI (Dash Updates #96): every box, with what the person typed kept. Money comes as a string. */
export interface CleanUpValues {
  title: string;
  short_name: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  upc: string;
  condition: ItemCondition | '';
  price: string | null;
  retail_estimate: string | null;
  tags: string[];
  identifiers: Record<string, string>;
  specifications: Record<string, string>;
}

export type CleanUpField = keyof CleanUpValues;

export interface CleanUpResponse {
  values: CleanUpValues;
  /** The boxes the AI filled (or, for identifiers and specifications, added to). */
  filled: CleanUpField[];
  problems: string[];
  confidence: 'high' | 'medium' | 'low';
  /** Where the price came from: "our sales of similar items", "the AI", "typed" or "". */
  price_from: string;
  model: string;
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

/**
 * Clean up with AI (#96): the big box, the photos (up to 4 go to the model) and the boxes the person filled.
 * The server never changes a typed box. A failure throws with a plain `detail`; the caller leaves the form alone.
 */
export function cleanUpWithAi(text: string, typed: Partial<Record<CleanUpField, unknown>>, photos: File[]) {
  const form = new FormData();
  form.append('payload', JSON.stringify({ text, typed }));
  photos.slice(0, 4).forEach((p) => form.append('photos', p));
  return api.post<CleanUpResponse>('/inventory/add-item/clean-up/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90_000,
  }).then((r) => r.data);
}

/** Check in Misfit items. Photos go with a new product (the first on the product, all kept). 409 = the retail check. */
export function addItemCheckIn(payload: AddItemCheckInPayload, photos?: File[] | null) {
  if (!photos?.length) return api.post<AddItemCheckInResult>('/inventory/add-item/check-in/', payload).then((r) => r.data);
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  photos.forEach((p) => form.append('photos', p));
  return api.post<AddItemCheckInResult>('/inventory/add-item/check-in/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
}
