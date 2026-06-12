import type { ProcessingCheckInBatchDTO, ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';

export interface CheckedInHistoryRow {
  item: ProcessingWorkspaceItemDTO;
  /** All items represented by this row (batch members or a single item). */
  items: ProcessingWorkspaceItemDTO[];
  qty: number;
  batchId: number | null;
  batchCreatedAt: string | null;
  checkedInAt: string;
  /** Category from batch product when checked in as a batch. */
  batchProductCategory?: string | null;
}

export interface ProductGroupedHistory {
  productId: number | null;
  productLabel: string;
  totalQty: number;
  historyRows: CheckedInHistoryRow[];
}

export function isCheckedInItem(it: ProcessingWorkspaceItemDTO): boolean {
  return it.status !== 'intake' && it.status !== 'processing';
}

export function buildCheckedInHistoryRows(
  items: ProcessingWorkspaceItemDTO[] | undefined,
  batches: ProcessingCheckInBatchDTO[],
): CheckedInHistoryRow[] {
  const checkedIn = (items ?? []).filter(isCheckedInItem);
  const checkedInById = new Map(checkedIn.map((item) => [item.id, item]));
  const batchedItemIds = new Set<number>();
  const rows: CheckedInHistoryRow[] = [];

  const sortedBatches = [...batches].sort((a, b) => {
    const ta = a.created_at || '';
    const tb = b.created_at || '';
    return tb.localeCompare(ta) || b.id - a.id;
  });

  for (const batch of sortedBatches) {
    const batchItems = batch.item_ids
      .map((id) => checkedInById.get(id))
      .filter((item): item is ProcessingWorkspaceItemDTO => item != null);
    if (!batchItems.length) continue;
    batchItems.forEach((item) => batchedItemIds.add(item.id));
    const primary = batchItems[0];
    rows.push({
      item: primary,
      items: batchItems,
      qty: batch.quantity ?? batchItems.length,
      batchId: batch.id,
      batchCreatedAt: batch.created_at,
      checkedInAt: batch.created_at || primary.checked_in_at || primary.created_at || '',
      batchProductCategory: batch.product?.category || null,
    });
  }

  for (const item of checkedIn) {
    if (batchedItemIds.has(item.id)) continue;
    rows.push({
      item,
      items: [item],
      qty: 1,
      batchId: null,
      batchCreatedAt: null,
      checkedInAt: item.checked_in_at || item.created_at || '',
    });
  }

  rows.sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
  return rows;
}

export function productKeyForItem(it: ProcessingWorkspaceItemDTO): string {
  if (it.product != null) return `p:${it.product}`;
  if (it.product_number) return `n:${it.product_number}`;
  if (it.product_title) return `t:${it.product_title.trim().toLowerCase()}`;
  return `i:${it.id}`;
}

export function distinctProductCount(items: ProcessingWorkspaceItemDTO[]): number {
  return new Set(items.map(productKeyForItem)).size;
}

function productLabelForHistoryRow(row: CheckedInHistoryRow): string {
  const item = row.item;
  if (item.product_title?.trim()) return item.product_title.trim();
  if (item.product_number) return item.product_number;
  if (item.product != null) return `Product #${item.product}`;
  return 'Unknown product';
}

export function buildProductGroupedHistory(
  items: ProcessingWorkspaceItemDTO[] | undefined,
  batches: ProcessingCheckInBatchDTO[],
): ProductGroupedHistory[] {
  const historyRows = buildCheckedInHistoryRows(items, batches);
  const groups = new Map<string, ProductGroupedHistory>();

  for (const row of historyRows) {
    const key = productKeyForItem(row.item);
    const existing = groups.get(key);
    if (existing) {
      existing.historyRows.push(row);
      existing.totalQty += row.qty;
      continue;
    }
    groups.set(key, {
      productId: row.item.product ?? null,
      productLabel: productLabelForHistoryRow(row),
      totalQty: row.qty,
      historyRows: [row],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      historyRows: [...group.historyRows].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)),
    }))
    .sort((a, b) => b.totalQty - a.totalQty || a.productLabel.localeCompare(b.productLabel));
}

export function disputedItemCount(items: ProcessingWorkspaceItemDTO[]): number {
  return items.filter(
    (it) =>
      Boolean(it.dispute_type)
      || it.dispute_pct_loss != null
      || it.status === 'scrapped'
      || it.status === 'lost',
  ).length;
}
