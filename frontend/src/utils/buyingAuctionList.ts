import type { GridSortModel } from '@mui/x-data-grid';
import type { BuyingAuctionListItem } from '../types/buying.types';

export function msUntilEnd(endTime: string | null): number | null {
  if (!endTime) return null;
  const t = new Date(endTime).getTime();
  if (Number.isNaN(t)) return null;
  return t - Date.now();
}

/** Show seconds in countdown when under this threshold (desktop + detail). */
export const MS_TIME_REMAINING_WITH_SECONDS = 5 * 60 * 1000;

export function formatTimeRemaining(endTime: string | null): string {
  const ms = msUntilEnd(endTime);
  if (ms == null) return 'N/A';
  if (ms <= 0) return 'Ended';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (ms < MS_TIME_REMAINING_WITH_SECONDS) return `${m}m ${s}s`;
  return `${m}m`;
}

const MS_6H = 6 * 60 * 60 * 1000;
const SEC_10M = 10 * 60;

/** Mobile list: tiered — >6h hours only; <6h but ≥10m hours+minutes; <5m minutes+seconds (aligned with desktop). */
export function formatTimeRemainingShort(endTime: string | null): string {
  const ms = msUntilEnd(endTime);
  if (ms == null) return 'N/A';
  if (ms <= 0) return 'Ended';
  const totalSec = Math.floor(ms / 1000);

  if (ms > MS_6H) {
    const h = Math.floor(ms / (60 * 60 * 1000));
    return `${h}h`;
  }
  if (totalSec >= SEC_10M) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (ms < MS_TIME_REMAINING_WITH_SECONDS) return `${m}m ${s}s`;
  return `${m}m`;
}

const MS_1H = 60 * 60 * 1000;
const MS_4H = 4 * MS_1H;

/** Spec: normal >4h, orange <4h, red <1h. */
export function timeRemainingSx(endTime: string | null): Record<string, unknown> {
  const ms = msUntilEnd(endTime);
  if (ms == null || ms <= 0) return {};
  if (ms <= MS_1H) return { color: 'error.main', fontWeight: 600 };
  if (ms <= MS_4H) return { color: 'warning.main', fontWeight: 600 };
  return {};
}

const MS_24H = 24 * MS_1H;

/**
 * Auction **detail** card: stronger hierarchy than list cells — within 24h gets
 * emphasis; <4h warning; <1h critical (aligns with list but adds a 24h tier).
 */
export function timeRemainingDetailSx(endTime: string | null): Record<string, unknown> {
  const ms = msUntilEnd(endTime);
  if (ms == null || ms <= 0) return { color: 'text.secondary' };
  if (ms <= MS_1H) return { color: 'error.main', fontWeight: 700 };
  if (ms <= MS_4H) return { color: 'warning.main', fontWeight: 700 };
  if (ms <= MS_24H) return { color: 'warning.dark', fontWeight: 600 };
  return { color: 'text.primary', fontWeight: 600 };
}

/** Mobile card accent: left border + tint for urgent time remaining. */
export type TimeUrgency = 'none' | 'urgent' | 'soon';

export function timeUrgency(endTime: string | null): TimeUrgency {
  const ms = msUntilEnd(endTime);
  if (ms == null || ms <= 0) return 'none';
  if (ms <= MS_1H) return 'urgent';
  if (ms <= MS_4H) return 'soon';
  return 'none';
}

const ORDERING_FIELDS = [
  'end_time',
  'current_price',
  'bid_count',
  'last_updated_at',
  'total_retail_value',
  'retail_sort',
  'price_retail_pct',
  'marketplace__name',
  'title',
  'condition_summary',
  'status',
  'has_manifest',
  'lot_size',
  'priority',
  'need_score',
  'est_profit',
  'thumbs_up_count',
  'archived_at',
  'watchlist_sort',
] as const;

/**
 * Map legacy API ordering tokens (pre–v2.19) to current field names.
 */
export function normalizeBuyingListOrdering(ordering: string): string {
  if (!ordering) return ordering;
  return ordering
    .split(',')
    .map((part) => {
      const t = part.trim();
      if (t === '-thumbs_up') return '-thumbs_up_count';
      if (t === 'thumbs_up') return 'thumbs_up_count';
      return t;
    })
    .join(',');
}

/**
 * Default API `ordering` when the user has not chosen a column sort this session
 * (watch first, then thumbs, priority, need — all desc).
 */
export const DEFAULT_BUYING_LIST_ORDERING =
  '-watchlist_sort,-thumbs_up_count,-priority,-need_score';
const DEFAULT_LIST_ORDERING = DEFAULT_BUYING_LIST_ORDERING;

/** Session-sticky sort persistence (Phase 3B G). */
export const BUYING_AUCTION_LIST_ORDERING_STORAGE_KEY = 'ecothrift.buying.auctionList.ordering';
/** Calendar day in America/Chicago (YYYY-MM-DD) for last saved auction-list ordering — new day resets to default. */
export const BUYING_AUCTION_LIST_ORDERING_DAY_KEY = 'ecothrift.buying.auctionList.orderingDay';
export const BUYING_WATCHLIST_ORDERING_STORAGE_KEY = 'ecothrift.buying.watchlist.ordering';

/** Today’s date string in America/Chicago (for daily ordering reset). */
export function buyingListCdtYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function orderingFromSortModel(model: GridSortModel): string {
  if (!model.length) return DEFAULT_LIST_ORDERING;
  let { field, sort } = model[0];
  if (field === 'thumbs_up') field = 'thumbs_up_count';
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return DEFAULT_LIST_ORDERING;
  const prefix = sort === 'desc' ? '-' : '';
  const base = `${prefix}${field}`;
  if (field === 'priority') {
    return sort === 'desc' ? '-priority,end_time' : 'priority,end_time';
  }
  if (field === 'need_score') {
    return sort === 'desc' ? '-need_score,end_time' : 'need_score,end_time';
  }
  return base;
}

export function sortModelFromOrdering(ordering: string): GridSortModel {
  const normalized = normalizeBuyingListOrdering(ordering);
  if (!normalized) return [{ field: 'watchlist_sort', sort: 'desc' }];
  const first = normalized.split(',')[0].trim();
  const desc = first.startsWith('-');
  let field = (desc ? first.slice(1) : first) as (typeof ORDERING_FIELDS)[number] | 'thumbs_up';
  if (field === 'thumbs_up') field = 'thumbs_up_count';
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return [{ field: 'watchlist_sort', sort: 'desc' }];
  return [{ field, sort: desc ? 'desc' : 'asc' }];
}

/** Mobile sort dropdown; values are API `ordering` strings. */
export const MOBILE_SORT_OPTIONS = [
  {
    value: DEFAULT_BUYING_LIST_ORDERING,
    label: 'Watch / thumbs / priority / need (default)',
  },
  { value: '-priority,end_time', label: 'Priority, then ending soon' },
  { value: 'end_time', label: 'Ending soonest' },
  { value: 'current_price', label: 'Price: low to high' },
  { value: '-current_price', label: 'Price: high to low' },
  { value: '-total_retail_value', label: 'Total retail (high to low)' },
  { value: '-price_retail_pct', label: 'P/R % (high to low)' },
  { value: 'price_retail_pct', label: 'P/R % (low to high)' },
  { value: '-need_score', label: 'Need score (high to low)' },
  { value: '-last_updated_at', label: 'Recently updated' },
] as const;

function parseMoneyString(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Cost ÷ listing `total_retail_value` × 100; listing retail only (not manifest sum). */
export function formatAuctionCostToRetailPct(row: BuyingAuctionListItem): string {
  const retail = parseMoneyString(row.total_retail_value);
  const cost = parseMoneyString(row.estimated_total_cost);
  if (retail == null || retail <= 0 || cost == null) return '—';
  return `${((cost / retail) * 100).toFixed(1)}%`;
}

/**
 * Current price ÷ retail (same base as list **Retail** column: manifest sum when present) × 100.
 * Whole-number percent, no fractional digits.
 */
export function formatPriceToRetailPct(row: BuyingAuctionListItem): string {
  const price = parseMoneyString(row.current_price);
  const retail = parseMoneyString(row.total_retail_display ?? row.total_retail_value);
  if (price == null || retail == null || retail <= 0) return '—';
  return `${Math.round((price / retail) * 100)}%`;
}
