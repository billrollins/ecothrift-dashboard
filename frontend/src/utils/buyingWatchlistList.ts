import type { GridSortModel } from '@mui/x-data-grid';

/** API ordering fields for GET /api/buying/watchlist/ (matches backend OrderingFilter). */
const WATCHLIST_ORDERING_FIELDS = [
  'end_time',
  'current_price',
  'total_retail_value',
  'added_at',
] as const;

/** Default: soonest ending first (ascending end_time). */
export function watchlistOrderingFromSortModel(model: GridSortModel): string {
  if (!model.length) return 'end_time';
  const { field, sort } = model[0];
  const allowed = WATCHLIST_ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return 'end_time';
  const prefix = sort === 'desc' ? '-' : '';
  return `${prefix}${field}`;
}

export function watchlistSortModelFromOrdering(ordering: string): GridSortModel {
  if (!ordering) return [{ field: 'end_time', sort: 'asc' }];
  const desc = ordering.startsWith('-');
  const field = (desc ? ordering.slice(1) : ordering) as string;
  const allowed = WATCHLIST_ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return [{ field: 'end_time', sort: 'asc' }];
  return [{ field, sort: desc ? 'desc' : 'asc' }];
}

export const WATCHLIST_MOBILE_SORT_OPTIONS = [
  { value: 'end_time', label: 'Ending soon' },
  { value: '-end_time', label: 'Ending last' },
  { value: 'current_price', label: 'Price: low to high' },
  { value: '-current_price', label: 'Price: high to low' },
  { value: '-total_retail_value', label: 'Total retail (high to low)' },
  { value: '-added_at', label: 'Recently added' },
  { value: 'added_at', label: 'Oldest added first' },
] as const;
