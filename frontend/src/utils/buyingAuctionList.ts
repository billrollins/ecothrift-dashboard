import type { GridSortModel } from '@mui/x-data-grid';
import type { BuyingAuctionListItem } from '../types/buying.types';

export function msUntilEnd(endTime: string | null): number | null {
  if (!endTime) return null;
  const t = new Date(endTime).getTime();
  if (Number.isNaN(t)) return null;
  return t - Date.now();
}

export function formatTimeRemaining(endTime: string | null): string {
  const ms = msUntilEnd(endTime);
  if (ms == null) return 'N/A';
  if (ms <= 0) return 'Ended';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MS_6H = 6 * 60 * 60 * 1000;
const SEC_10M = 10 * 60;

/** Mobile list: tiered — >6h hours only; <6h but ≥10m hours+minutes; <10m minutes+seconds. */
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
  return `${m}m ${s}s`;
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
  'marketplace__name',
  'title',
  'condition_summary',
  'status',
  'has_manifest',
  'lot_size',
  'priority',
  'need_score',
] as const;

const DEFAULT_LIST_ORDERING = '-priority,end_time';

export function orderingFromSortModel(model: GridSortModel): string {
  if (!model.length) return DEFAULT_LIST_ORDERING;
  const { field, sort } = model[0];
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return DEFAULT_LIST_ORDERING;
  const prefix = sort === 'desc' ? '-' : '';
  const base = `${prefix}${field}`;
  if (field === 'priority') {
    return sort === 'desc' ? '-priority,end_time' : 'priority,end_time';
  }
  return base;
}

export function sortModelFromOrdering(ordering: string): GridSortModel {
  if (!ordering) return [{ field: 'priority', sort: 'desc' }];
  const first = ordering.split(',')[0].trim();
  const desc = first.startsWith('-');
  const field = (desc ? first.slice(1) : first) as (typeof ORDERING_FIELDS)[number];
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return [{ field: 'priority', sort: 'desc' }];
  return [{ field, sort: desc ? 'desc' : 'asc' }];
}

/** Mobile sort dropdown; values are API `ordering` strings. */
export const MOBILE_SORT_OPTIONS = [
  { value: '-priority,end_time', label: 'Priority (default)' },
  { value: 'end_time', label: 'Ending soonest' },
  { value: 'current_price', label: 'Price: low to high' },
  { value: '-current_price', label: 'Price: high to low' },
  { value: '-total_retail_value', label: 'Total retail (high to low)' },
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
