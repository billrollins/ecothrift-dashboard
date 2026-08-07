import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceProductDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow } from './checkedInHistory';
import {
  formatQueueMoney,
  itemStatusMeta,
  queueDispatchLabel,
} from './processingQueueCellText';

export function formatCheckedInShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function checkedInProductIdText(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const { item } = row;
  const checkInProductNumber = row.checkInProduct?.product_number?.trim();
  return (
    (checkInProductNumber || item.product_number)
    ?? (item.product != null ? String(item.product) : null)
    ?? (item.product === fallbackProduct?.id ? fallbackProduct.product_number : null)
    ?? '-'
  );
}

export function checkedInBrandText(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const { item } = row;
  return row.checkInProduct?.brand ?? item.product_brand ?? (item.product === fallbackProduct?.id ? fallbackProduct.brand : null) ?? '-';
}

export function checkedInTitleText(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const { item } = row;
  return (
    row.checkInProduct?.title
    ?? item.product_title
    ?? (item.product === fallbackProduct?.id ? fallbackProduct.title : null)
    ?? '-'
  );
}

export function checkedInModelText(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const { item } = row;
  return (
    row.checkInProduct?.model
    ?? item.product_model
    ?? (item.product === fallbackProduct?.id ? fallbackProduct.model : null)
    ?? '-'
  );
}

export function checkedInCategoryText(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const fromCheckIn = (row.checkInProductCategory || '').trim();
  const fromProduct = (row.checkInProduct?.category || '').trim();
  if (fromProduct) return fromProduct;
  if (fromCheckIn) return fromCheckIn;
  const { item } = row;
  if (item.product === fallbackProduct?.id && fallbackProduct?.category) {
    return fallbackProduct.category;
  }
  return '-';
}

export function itemLocationLabel(location: string | null | undefined): string {
  const raw = (location || '').trim();
  if (!raw) return '-';
  return queueDispatchLabel(raw);
}

export function formatCheckedInProductSummary(
  row: CheckedInHistoryRow,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
): string {
  const parts = [
    checkedInProductIdText(row, fallbackProduct),
    checkedInTitleText(row, fallbackProduct),
    checkedInBrandText(row, fallbackProduct),
    checkedInModelText(row, fallbackProduct),
    checkedInCategoryText(row, fallbackProduct),
  ].filter((part) => part && part !== '-');
  return parts.length ? parts.join(' · ') : '-';
}

export function formatCheckedInItemSummary(item: ProcessingWorkspaceItemDTO): string {
  const statusMeta = itemStatusMeta(item);
  const parts = [
    formatQueueMoney(item.price),
    item.condition_label || item.condition,
    statusMeta.label,
    queueDispatchLabel(item.dispatch),
    itemLocationLabel(item.location ?? item.dispatch),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
}

export function historyRowIncludesItem(row: CheckedInHistoryRow, itemId: number | null): boolean {
  if (itemId == null) return false;
  return row.items.some((item) => item.id === itemId);
}
