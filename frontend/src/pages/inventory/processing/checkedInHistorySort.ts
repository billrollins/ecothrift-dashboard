import type { ProcessingWorkspaceProductDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow } from './checkedInHistory';
import {
  checkedInBrandText,
  checkedInCategoryText,
  checkedInModelText,
  checkedInProductIdText,
  checkedInTitleText,
} from './checkedInHistoryDisplay';
import { formatQueueMoney, queueDispatchLabel } from './processingQueueCellText';

export type CheckedInSortField =
  | 'checkedIn'
  | 'qty'
  | 'productId'
  | 'brand'
  | 'title'
  | 'model'
  | 'category'
  | 'retail'
  | 'price'
  | 'condition'
  | 'dispatch';

export type CheckedInSortState = { field: CheckedInSortField; dir: 'asc' | 'desc' } | null;

export const DEFAULT_CHECKED_IN_SORT = { field: 'checkedIn', dir: 'desc' } as const satisfies CheckedInSortState;

function effectiveSortState(sortState: CheckedInSortState): { field: CheckedInSortField; dir: 'asc' | 'desc' } {
  return sortState ?? DEFAULT_CHECKED_IN_SORT;
}

export function sortCheckedInHistoryRows(
  rows: CheckedInHistoryRow[],
  sortState: CheckedInSortState,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): CheckedInHistoryRow[] {
  const copy = [...rows];
  const { field, dir } = effectiveSortState(sortState);
  const mult = dir === 'asc' ? 1 : -1;

  copy.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'checkedIn':
        cmp = a.checkedInAt.localeCompare(b.checkedInAt);
        break;
      case 'qty':
        cmp = a.qty - b.qty;
        break;
      case 'productId':
        cmp = checkedInProductIdText(a, fallbackProduct).localeCompare(checkedInProductIdText(b, fallbackProduct));
        break;
      case 'brand':
        cmp = checkedInBrandText(a, fallbackProduct).localeCompare(checkedInBrandText(b, fallbackProduct));
        break;
      case 'title':
        cmp = checkedInTitleText(a, fallbackProduct).localeCompare(checkedInTitleText(b, fallbackProduct));
        break;
      case 'model':
        cmp = checkedInModelText(a, fallbackProduct).localeCompare(checkedInModelText(b, fallbackProduct));
        break;
      case 'category':
        cmp = checkedInCategoryText(a, fallbackProduct).localeCompare(checkedInCategoryText(b, fallbackProduct));
        break;
      case 'retail':
        cmp = formatQueueMoney(a.item.retail).localeCompare(formatQueueMoney(b.item.retail));
        break;
      case 'price':
        cmp = formatQueueMoney(a.item.price).localeCompare(formatQueueMoney(b.item.price));
        break;
      case 'condition':
        cmp = (a.item.condition_label || a.item.condition).localeCompare(b.item.condition_label || b.item.condition);
        break;
      case 'dispatch':
        cmp = queueDispatchLabel(a.item.dispatch).localeCompare(queueDispatchLabel(b.item.dispatch));
        break;
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = b.checkedInAt.localeCompare(a.checkedInAt);
    return cmp * mult;
  });

  return copy;
}

export function cycleCheckedInSort(
  prev: CheckedInSortState,
  field: CheckedInSortField,
): CheckedInSortState {
  if (prev == null) {
    return field === 'checkedIn' ? { field, dir: 'desc' } : { field, dir: 'asc' };
  }
  if (prev.field !== field) {
    return field === 'checkedIn' ? { field, dir: 'desc' } : { field, dir: 'asc' };
  }
  if (prev.dir === 'desc') return { field, dir: 'asc' };
  return null;
}

export function checkedInSortDirection(
  sortState: CheckedInSortState,
  field: CheckedInSortField,
): 'asc' | 'desc' {
  const effective = effectiveSortState(sortState);
  if (sortState != null && effective.field === field) return effective.dir;
  return field === 'checkedIn' ? 'desc' : 'asc';
}

export function isCheckedInSortActive(sortState: CheckedInSortState, field: CheckedInSortField): boolean {
  return sortState?.field === field;
}

export { checkedInBrandText, checkedInTitleText } from './checkedInHistoryDisplay';
