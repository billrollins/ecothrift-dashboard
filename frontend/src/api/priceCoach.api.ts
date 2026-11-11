import api from './client';

/** Equal items behind the coach line as one row: same product, same price. */
export interface PriceCoachGroup {
  title: string;
  /** What they sold for, or the tag while on the shelf. */
  price: number;
  n: number;
  /** This exact product (not a similar one). */
  own: boolean;
  /** Days to sell, or days on the shelf so far. */
  min_days: number;
  max_days: number;
  median_days: number;
}

export interface PriceCoachSold {
  n: number;
  /** The middle half of what they sold for. */
  low: number;
  high: number;
  median_days: number;
  /** The lowest and highest sale, so the words can say "all for $6.29". */
  min?: number;
  max?: number;
}

export interface PriceCoachShelf {
  n: number;
  oldest_days: number;
  min_price: number | null;
  max_price: number | null;
  /** Of them, from the truck being checked in now (when the order was given). */
  this_truck?: number;
  /** How many of them have sat `sitting_days` or longer. */
  sitting: number;
  sitting_days: number;
}

/** What items like this sold for here, and how fast (apps/inventory/services/price_coach.py). */
export interface PriceCoach {
  /** What the line rests on: the same product, similar products, or the category and brand. '' = not enough. */
  basis: '' | 'product' | 'similar' | 'category_brand';
  /** For category_brand: "Brand in Category". */
  label: string;
  /** Sold plus on the shelf: the parts of the line add up to this. */
  n: number;
  enough: boolean;
  sold: PriceCoachSold | null;
  on_shelf: PriceCoachShelf | null;
  /** This exact product's own few items, when the line rests on a wider group. */
  own: { n: number; sold: PriceCoachSold | null; on_shelf: PriceCoachShelf } | null;
  /** This product's items tagged close to the typed price: a plain count, whichever way it points. */
  near: {
    price: number;
    /** The tag band counted as near: within 15% either way. */
    low?: number;
    high?: number;
    /** 'product': this product's own tags; 'group': too few of its own, so the wider group's. */
    scope?: 'product' | 'group';
    n: number;
    sold: number;
    on_shelf: number;
    oldest_days: number;
  } | null;
  sold_groups: PriceCoachGroup[];
  shelf_groups: PriceCoachGroup[];
  /** Items in groups left off the list. */
  more: { sold: number; on_shelf: number };
}

export interface PriceCoachResponse {
  enabled: boolean;
  coach: PriceCoach | null;
}

/** Check-in never waits on this: past 4 seconds the call is dropped and the screen shows nothing. */
export const PRICE_COACH_TIMEOUT_MS = 4000;

export function getPriceCoach(params: { product: number; price?: string; order?: number | null }, signal?: AbortSignal) {
  return api.get<PriceCoachResponse>('/inventory/price-coach/', {
    params: { product: params.product, price: params.price || undefined, order: params.order ?? undefined },
    signal,
    timeout: PRICE_COACH_TIMEOUT_MS,
  });
}
