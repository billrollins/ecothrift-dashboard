import { format, isValid, parseISO, subDays } from 'date-fns';
import type { PurchaseOrderCondition } from '../../../types/inventory.types';

export type StatusBucket = 'all' | 'pending' | 'in_transit' | 'delivered' | 'processing' | 'complete';

export type OrderDateField = 'delivered_date' | 'shipped_date' | 'paid_date' | 'ordered_date';

export type OrderListUrlState = {
  search: string;
  statusBucket: StatusBucket;
  condition: PurchaseOrderCondition | '';
  dateField: OrderDateField;
  dateFrom: string | null;
  dateTo: string | null;
  itemCountMin: string;
  itemCountMax: string;
  /** When false (default), API excludes POs with no milestone in the last ~6 months. */
  includeOlder: boolean;
  page: number;
  pageSize: number;
  ordering: string;
};

export const DEFAULT_ORDER_LIST_STATE: OrderListUrlState = {
  search: '',
  statusBucket: 'all',
  condition: '',
  dateField: 'delivered_date',
  dateFrom: null,
  dateTo: null,
  itemCountMin: '',
  itemCountMax: '',
  includeOlder: false,
  page: 0,
  pageSize: 25,
  ordering: 'milestones',
};

const STATUS_BUCKETS: StatusBucket[] = [
  'all',
  'pending',
  'in_transit',
  'delivered',
  'processing',
  'complete',
];

const DATE_FIELDS: OrderDateField[] = [
  'delivered_date',
  'shipped_date',
  'paid_date',
  'ordered_date',
];

const CONDITIONS: PurchaseOrderCondition[] = [
  'new',
  'like_new',
  'good',
  'fair',
  'salvage',
  'mixed',
];

export function statusParams(bucket: StatusBucket): Record<string, string> {
  switch (bucket) {
    case 'pending':
      return { status__in: 'ordered,paid' };
    case 'in_transit':
      return { status: 'shipped' };
    case 'delivered':
      return { status: 'delivered' };
    case 'processing':
      return { status: 'processing' };
    case 'complete':
      return { status: 'complete' };
    default:
      return {};
  }
}

export function parseOrderListSearchParams(params: URLSearchParams): OrderListUrlState {
  const bucketRaw = params.get('bucket') || 'all';
  const statusBucket = STATUS_BUCKETS.includes(bucketRaw as StatusBucket)
    ? (bucketRaw as StatusBucket)
    : 'all';
  const dateFieldRaw = params.get('date_field') || 'delivered_date';
  const dateField = DATE_FIELDS.includes(dateFieldRaw as OrderDateField)
    ? (dateFieldRaw as OrderDateField)
    : 'delivered_date';
  const conditionRaw = params.get('condition') || '';
  const condition = CONDITIONS.includes(conditionRaw as PurchaseOrderCondition)
    ? (conditionRaw as PurchaseOrderCondition)
    : '';
  const pageRaw = Number.parseInt(params.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw - 1 : 0;
  const pageSizeRaw = Number.parseInt(params.get('page_size') || '25', 10);
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const dateFrom = params.get('date_after');
  const dateTo = params.get('date_before');
  const olderRaw = (params.get('older') || '').toLowerCase();
  return {
    search: params.get('q') || params.get('search') || '',
    statusBucket,
    condition,
    dateField,
    dateFrom: dateFrom && isValid(parseISO(dateFrom)) ? dateFrom : null,
    dateTo: dateTo && isValid(parseISO(dateTo)) ? dateTo : null,
    itemCountMin: params.get('item_count_min') || '',
    itemCountMax: params.get('item_count_max') || '',
    includeOlder: olderRaw === '1' || olderRaw === 'true' || olderRaw === 'yes',
    page,
    pageSize,
    ordering: params.get('ordering') || 'milestones',
  };
}

export function orderListStateToSearchParams(state: OrderListUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.search.trim()) p.set('q', state.search.trim());
  if (state.statusBucket !== 'all') p.set('bucket', state.statusBucket);
  if (state.condition) p.set('condition', state.condition);
  if (state.dateField !== 'delivered_date') p.set('date_field', state.dateField);
  if (state.dateFrom) p.set('date_after', state.dateFrom);
  if (state.dateTo) p.set('date_before', state.dateTo);
  if (state.itemCountMin) p.set('item_count_min', state.itemCountMin);
  if (state.itemCountMax) p.set('item_count_max', state.itemCountMax);
  if (state.includeOlder) p.set('older', '1');
  if (state.page > 0) p.set('page', String(state.page + 1));
  if (state.pageSize !== 25) p.set('page_size', String(state.pageSize));
  if (state.ordering && state.ordering !== 'milestones') p.set('ordering', state.ordering);
  return p;
}

export function orderListStateToApiParams(state: OrderListUrlState): Record<string, string | number> {
  const p: Record<string, string | number> = {
    ...statusParams(state.statusBucket),
    ordering: state.ordering || 'milestones',
    page: state.page + 1,
    page_size: state.pageSize,
    include_older: state.includeOlder ? '1' : '0',
  };
  if (state.search.trim()) p.search = state.search.trim();
  if (state.condition) p.condition = state.condition;
  if (state.dateFrom || state.dateTo) {
    p.date_field = state.dateField;
    if (state.dateFrom) p.date_after = state.dateFrom;
    if (state.dateTo) p.date_before = state.dateTo;
  }
  if (state.itemCountMin) p.item_count_min = state.itemCountMin;
  if (state.itemCountMax) p.item_count_max = state.itemCountMax;
  return p;
}

export function filterFingerprint(state: OrderListUrlState): string {
  return JSON.stringify({
    search: state.search.trim(),
    statusBucket: state.statusBucket,
    condition: state.condition,
    dateField: state.dateField,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
    itemCountMin: state.itemCountMin,
    itemCountMax: state.itemCountMax,
    includeOlder: state.includeOlder,
  });
}

export type ActiveFilterChip = {
  id: string;
  label: string;
};

export function activeFilterChips(state: OrderListUrlState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (state.search.trim()) {
    chips.push({ id: 'search', label: `Search: ${state.search.trim()}` });
  }
  if (state.statusBucket !== 'all') {
    chips.push({
      id: 'bucket',
      label: `Status: ${state.statusBucket.replace(/_/g, ' ')}`,
    });
  }
  if (state.condition) {
    chips.push({
      id: 'condition',
      label: `Condition: ${state.condition.replace(/_/g, ' ')}`,
    });
  }
  if (state.dateFrom || state.dateTo) {
    const field = state.dateField.replace('_date', '').replace('_', ' ');
    const from = state.dateFrom
      ? format(parseISO(state.dateFrom), 'MMM d, yyyy')
      : '…';
    const to = state.dateTo ? format(parseISO(state.dateTo), 'MMM d, yyyy') : '…';
    chips.push({ id: 'dates', label: `${field}: ${from} - ${to}` });
  }
  if (state.itemCountMin || state.itemCountMax) {
    chips.push({
      id: 'items',
      label: `Items: ${state.itemCountMin || '0'}-${state.itemCountMax || '∞'}`,
    });
  }
  if (state.includeOlder) {
    chips.push({ id: 'older', label: 'Including older orders' });
  }
  return chips;
}

export function clearChip(state: OrderListUrlState, chipId: string): OrderListUrlState {
  switch (chipId) {
    case 'search':
      return { ...state, search: '', page: 0 };
    case 'bucket':
      return { ...state, statusBucket: 'all', page: 0 };
    case 'condition':
      return { ...state, condition: '', page: 0 };
    case 'dates':
      return { ...state, dateFrom: null, dateTo: null, page: 0 };
    case 'items':
      return { ...state, itemCountMin: '', itemCountMax: '', page: 0 };
    case 'older':
      return { ...state, includeOlder: false, page: 0 };
    default:
      return state;
  }
}

export function clearAllFilters(state: OrderListUrlState): OrderListUrlState {
  return {
    ...state,
    search: '',
    statusBucket: 'all',
    condition: '',
    dateFrom: null,
    dateTo: null,
    itemCountMin: '',
    itemCountMax: '',
    page: 0,
  };
}

/** Delivered-date window: 90 days ago through 60 days ago (inclusive). */
export function applyDelivered90to60(
  state: OrderListUrlState,
  today: Date = new Date(),
): OrderListUrlState {
  return {
    ...state,
    dateField: 'delivered_date',
    dateFrom: format(subDays(today, 90), 'yyyy-MM-dd'),
    dateTo: format(subDays(today, 60), 'yyyy-MM-dd'),
    page: 0,
  };
}

/** True when filters match the 90-60 delivered preset (for button highlight). */
export function isDelivered90to60Active(
  state: OrderListUrlState,
  today: Date = new Date(),
): boolean {
  const preset = applyDelivered90to60(DEFAULT_ORDER_LIST_STATE, today);
  return (
    state.dateField === preset.dateField &&
    state.dateFrom === preset.dateFrom &&
    state.dateTo === preset.dateTo
  );
}

/** All orders ordered in the last 60 days (inclusive through today). */
export function applyLast60Days(
  state: OrderListUrlState,
  today: Date = new Date(),
): OrderListUrlState {
  return {
    ...state,
    statusBucket: 'all',
    dateField: 'ordered_date',
    dateFrom: format(subDays(today, 60), 'yyyy-MM-dd'),
    dateTo: format(today, 'yyyy-MM-dd'),
    page: 0,
  };
}

/** True when filters match the Last 60 ordered preset (for button highlight). */
export function isLast60DaysActive(
  state: OrderListUrlState,
  today: Date = new Date(),
): boolean {
  const preset = applyLast60Days(DEFAULT_ORDER_LIST_STATE, today);
  return (
    state.statusBucket === 'all' &&
    state.dateField === preset.dateField &&
    state.dateFrom === preset.dateFrom &&
    state.dateTo === preset.dateTo
  );
}
