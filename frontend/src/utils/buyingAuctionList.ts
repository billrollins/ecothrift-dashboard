import type { GridSortModel } from '@mui/x-data-grid';

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

/** Same color rules as desktop DataGrid time column. */
export function timeRemainingSx(endTime: string | null): Record<string, unknown> {
  const ms = msUntilEnd(endTime);
  if (ms == null || ms <= 0) return {};
  if (ms <= 15 * 60 * 1000) return { color: 'error.main', fontWeight: 600 };
  if (ms <= 60 * 60 * 1000) return { color: 'warning.main', fontWeight: 600 };
  return {};
}

/** Mobile card accent: left border + tint for urgent time remaining. */
export type TimeUrgency = 'none' | 'urgent' | 'soon';

export function timeUrgency(endTime: string | null): TimeUrgency {
  const ms = msUntilEnd(endTime);
  if (ms == null || ms <= 0) return 'none';
  if (ms <= 15 * 60 * 1000) return 'urgent';
  if (ms <= 60 * 60 * 1000) return 'soon';
  return 'none';
}

const ORDERING_FIELDS = [
  'end_time',
  'current_price',
  'bid_count',
  'last_updated_at',
  'total_retail_value',
] as const;

export function orderingFromSortModel(model: GridSortModel): string {
  if (!model.length) return '-end_time';
  const { field, sort } = model[0];
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return '-end_time';
  const prefix = sort === 'desc' ? '-' : '';
  return `${prefix}${field}`;
}

export function sortModelFromOrdering(ordering: string): GridSortModel {
  if (!ordering) return [{ field: 'end_time', sort: 'desc' }];
  const desc = ordering.startsWith('-');
  const field = (desc ? ordering.slice(1) : ordering) as (typeof ORDERING_FIELDS)[number];
  const allowed = ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return [{ field: 'end_time', sort: 'desc' }];
  return [{ field, sort: desc ? 'desc' : 'asc' }];
}

/** Mobile sort dropdown; values are API `ordering` strings. Total retail: high to low. */
export const MOBILE_SORT_OPTIONS = [
  { value: '-end_time', label: 'Ending soon' },
  { value: 'current_price', label: 'Price: low to high' },
  { value: '-current_price', label: 'Price: high to low' },
  { value: '-total_retail_value', label: 'Total retail (high to low)' },
  { value: '-last_updated_at', label: 'Recently updated' },
] as const;
