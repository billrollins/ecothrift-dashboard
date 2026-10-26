import api from './client';

/** Inventory → Review flag codes (apps/inventory/services/inventory_review.py). */
export type ReviewFlag = 'overstocked' | 'short' | 'stale' | 'slowing' | 'missing';

/** One category (or subcategory) row: flows over the span from the weekly rollup, stock as of now. */
export interface ReviewRow {
  key: string;
  label: string;
  units_in: number;
  legacy_sold: number;
  units_out: number;
  units_sold: number;
  units_scrapped: number;
  units_lost: number;
  units_returned: number;
  sales: string;
  net: string;
  sold_retail: string;
  sold_with_retail: number;
  sold_net_with_retail: string;
  sold_cost: string;
  sold_with_cost: number;
  sold_net_with_cost: string;
  sold_no_checkin: number;
  median_days_to_sell: number | null;
  sold_4wk: number;
  sold_12wk: number;
  on_hand: number;
  stale_on_hand: number;
  bulk_on_hand: number;
  on_hand_no_retail: number;
  on_hand_no_checkin: number;
  on_hand_missing: number;
  weeks_of_supply: number | null;
  stale_share: number | null;
  bulk_share: number | null;
  recovery: number | null;
  net_to_cost: number | null;
  flags: ReviewFlag[];
}

export interface ReviewResponse {
  span: 1 | 4;
  category: string | null;
  from: string;
  to: string;
  as_of: string;
  built: string | null;
  rows: ReviewRow[];
  total: ReviewRow;
  settings: Record<string, number>;
  flags: { key: ReviewFlag; label: string }[];
}

export function getInventoryReview(params: { span: 1 | 4; category?: string | null }, signal?: AbortSignal) {
  return api.get<ReviewResponse>('/inventory/review/', {
    params: { span: params.span, category: params.category || undefined },
    signal,
  });
}

/** The subcategory key the search drill uses for "no subcategory". */
export const NO_SUBCATEGORY_KEY = '(none)';
