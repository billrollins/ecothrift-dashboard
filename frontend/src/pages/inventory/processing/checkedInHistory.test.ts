import { describe, expect, it } from 'vitest';
import {
  buildCheckedInHistoryRows,
  buildProductGroupedHistory,
  distinctProductCount,
  disputedItemCount,
} from './checkedInHistory';
import type { ProcessingCheckInBatchDTO, ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';

function item(partial: Partial<ProcessingWorkspaceItemDTO> & Pick<ProcessingWorkspaceItemDTO, 'id' | 'sku'>): ProcessingWorkspaceItemDTO {
  return {
    condition: 'good',
    condition_label: 'Used Good',
    price: '10.00',
    retail: '20.00',
    dispatch: 'on_shelf',
    location: 'on_shelf',
    disposition: 'On shelf',
    notes: '',
    status: 'on_shelf',
    product: null,
    manifest_row: 1,
    checked_in_at: '2026-06-01T12:00:00Z',
    dispute_type: null,
    dispute_pct_loss: null,
    dispute_description: '',
    ...partial,
  };
}

describe('checkedInHistory', () => {
  it('builds rows with batch metadata sorted newest first', () => {
    const items = [
      item({ id: 1, sku: 'A', checked_in_at: '2026-06-01T10:00:00Z' }),
      item({ id: 2, sku: 'B', checked_in_at: '2026-06-02T10:00:00Z', status: 'intake' }),
      item({ id: 3, sku: 'C', checked_in_at: '2026-06-03T10:00:00Z' }),
    ];
    const batches: ProcessingCheckInBatchDTO[] = [
      {
        id: 9,
        quantity: 1,
        item_ids: [3],
        items: [items[2]],
        product: null,
        created_at: '2026-06-03T10:00:00Z',
        created_by: null,
        defaults: {},
        dispute_count: 0,
      },
    ];
    const rows = buildCheckedInHistoryRows(items, batches);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.item.sku).toBe('C');
    expect(rows[0]?.batchId).toBe(9);
    expect(rows[0]?.qty).toBe(1);
    expect(rows[1]?.item.sku).toBe('A');
    expect(rows[1]?.batchId).toBeNull();
  });

  it('counts distinct products and disputes', () => {
    const items = [
      item({ id: 1, sku: 'A', product: 10, product_number: 'PRD-1' }),
      item({ id: 2, sku: 'B', product: 10 }),
      item({ id: 3, sku: 'C', product: 11, dispute_type: 'broken', dispute_pct_loss: 20 }),
    ];
    expect(distinctProductCount(items)).toBe(2);
    expect(disputedItemCount(items)).toBe(1);
  });

  it('groups history rows by product sorted by total qty desc', () => {
    const items = [
      item({ id: 1, sku: 'A', product: 10, product_title: 'Alpha', checked_in_at: '2026-06-01T10:00:00Z' }),
      item({ id: 2, sku: 'B', product: 11, product_title: 'Beta', checked_in_at: '2026-06-02T10:00:00Z' }),
      item({ id: 3, sku: 'C', product: 11, product_title: 'Beta', checked_in_at: '2026-06-03T10:00:00Z' }),
    ];
    const batches: ProcessingCheckInBatchDTO[] = [
      {
        id: 1,
        quantity: 2,
        item_ids: [2, 3],
        items: [items[1], items[2]],
        product: { id: 11, title: 'Beta', brand: '', model: '', specs: {}, identifiers: {}, tags: [], taxonomy: '', category: '', upc: '', product_number: 'P-11' },
        created_at: '2026-06-03T10:00:00Z',
        created_by: null,
        defaults: {},
        dispute_count: 0,
      },
    ];
    const groups = buildProductGroupedHistory(items, batches);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.productLabel).toBe('Beta');
    expect(groups[0]?.totalQty).toBe(2);
    expect(groups[1]?.productLabel).toBe('Alpha');
    expect(groups[1]?.totalQty).toBe(1);
  });
});
