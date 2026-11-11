import api from './client';

/** One item behind the coach line. */
export interface PriceCoachItem {
  id: number;
  sku: string;
  title: string;
  sold: boolean;
  /** The tag price. */
  price: number;
  /** What it sold for; null while it is on the shelf. */
  sold_for: number | null;
  /** Days to sell, or days on the shelf so far. */
  days: number;
}

/** What items like this sold for here, and how fast (apps/inventory/services/price_coach.py). */
export interface PriceCoach {
  /** What the line rests on: the same product, similar products, or the category and brand. '' = not enough. */
  basis: '' | 'product' | 'similar' | 'category_brand';
  /** For category_brand: "Brand in Category". */
  label: string;
  n: number;
  enough: boolean;
  sold: { n: number; low: number; high: number; median_days: number } | null;
  on_shelf: { n: number; oldest_days: number } | null;
  sitting: { n: number; min_price: number; max_price: number; days: number } | null;
  /** Set when items tagged at the typed price or more have mostly sat. */
  note: { price: number; n: number; unsold: number; days: number } | null;
  items: PriceCoachItem[];
}

export interface PriceCoachResponse {
  enabled: boolean;
  coach: PriceCoach | null;
}

/** Check-in never waits on this: past 4 seconds the call is dropped and the screen shows nothing. */
export const PRICE_COACH_TIMEOUT_MS = 4000;

export function getPriceCoach(params: { product: number; price?: string }, signal?: AbortSignal) {
  return api.get<PriceCoachResponse>('/inventory/price-coach/', {
    params: { product: params.product, price: params.price || undefined },
    signal,
    timeout: PRICE_COACH_TIMEOUT_MS,
  });
}
