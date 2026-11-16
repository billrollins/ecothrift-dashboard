/**
 * Pricing standards (Dash Update #180): commodities hold one steady price; deep stock steps down to keep it flowing.
 * Server: `apps/inventory/services/pricing_standards.py`, `apps/inventory/api_pricing_standards.py`.
 */
import api from './client';
import type { BulkPriceChange } from './inventorySearch.api';

export type PriceStandard = '' | 'name_brand' | 'store_brand' | 'no';

export interface ProductStandard {
  product_id: number;
  /** What a person set ('' = not decided). */
  standard: PriceStandard;
  /** The keyword rules' guess while not decided ('' = none). Never stored. */
  suggested: '' | 'name_brand' | 'store_brand';
  label: string;
  share: number | null;
  /** The steady price for the retail given, or null. */
  price: string | null;
}

export interface Standards {
  name_share: number;
  store_share: number;
  sit_days: number;
  deep_min_units: number;
  check_days: number;
  sellout_days: number;
  step_share: number;
  floor_share: number;
  floor_commodity_share: number;
}

/** mixed: the tags vary more than 2x, so unlike items share the product; never stepped. */
export type DeepStatus = 'due' | 'waiting' | 'on_pace' | 'at_floor' | 'no_retail' | 'mixed';

export interface DeepStockRow {
  product_id: number;
  product_number: string;
  title: string;
  brand: string;
  standard: PriceStandard;
  commodity: boolean;
  units: number;
  sold: number;
  start: string;
  days: number;
  per_week: number;
  sellout_days: number | null;
  deadline: string;
  days_left: number;
  on_pace: boolean;
  last_step: string | null;
  next_check: string;
  status: DeepStatus;
  floor_share: number;
  price_low: string;
  price_high: string;
  pct_now: number | null;
  pct_after: number | null;
  new_low: string | null;
  new_high: string | null;
  stepping: number;
  no_retail: number;
  at_floor_units: number;
}

export interface SteppedRow {
  id: number;
  at: string;
  by: string;
  product_id: number | null;
  title: string;
  units: number;
  before: string;
  after: string;
  pct_before: number | null;
  pct_after: number | null;
  sold_since: number;
  undone_at: string | null;
}

export interface SatRow {
  product_id: number;
  title: string;
  brand: string;
  product_number: string;
  standard: PriceStandard;
  units: number;
  oldest_days: number;
  price_total: string;
}

export interface TruckOption {
  id: number;
  order_number: string;
  vendor: string;
  description: string;
  open_rows: number;
}

export interface TruckRow {
  id: number;
  row_number: number;
  title: string;
  brand: string;
  quantity: number;
  retail: string;
  price_now: string | null;
  price: string;
  standard: 'name_brand' | 'store_brand';
  label: string;
  source: 'product' | 'suggested';
  product_id: number | null;
  product_title: string;
  changes: boolean;
}

const BASE = '/inventory/pricing-standards';

export const getProductStandard = (productId: number, retail: string, signal?: AbortSignal) =>
  api.get<ProductStandard>(`${BASE}/product/${productId}/`, { params: retail ? { retail } : {}, signal });

export const markProductStandard = (productId: number, standard: PriceStandard, retail?: string) =>
  api.post<ProductStandard>(`${BASE}/product/${productId}/mark/`, { standard, retail });

export const getDeepStock = () => api.get<{ standards: Standards; today: string; rows: DeepStockRow[] }>(`${BASE}/deep-stock/`);

export const stepDeepStock = (productIds: number[]) =>
  api.post<{ changes: (BulkPriceChange & { product_id: number; title: string })[] }>(`${BASE}/deep-stock/step/`, { product_ids: productIds });

export const getStepped = () => api.get<{ results: SteppedRow[] }>(`${BASE}/stepped/`);

export const getSat = () => api.get<{ results: SatRow[]; standards: Standards }>(`${BASE}/sat/`);

export const getTrucks = () => api.get<{ results: TruckOption[] }>(`${BASE}/trucks/`);

export const getTruck = (poId: number) => api.get<{ standards: Standards; rows: TruckRow[] }>(`${BASE}/truck/${poId}/`);

export const applyTruck = (poId: number, rowIds: number[]) =>
  api.post<{ priced: number; confirmed: number }>(`${BASE}/truck/${poId}/apply/`, { row_ids: rowIds });

/** "65%" from 0.65. */
export const pct = (share: number) => `${Math.round(share * 100)}%`;
