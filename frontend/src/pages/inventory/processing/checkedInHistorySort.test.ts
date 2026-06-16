import { describe, expect, it } from 'vitest';
import type { ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow } from './checkedInHistory';
import { buildCheckedInHistoryRows } from './checkedInHistory';
import {
  checkedInBrandText,
  checkedInTitleText,
  formatCheckedInItemSummary,
  formatCheckedInProductSummary,
} from './checkedInHistoryDisplay';
import {
  cycleCheckedInSort,
  sortCheckedInHistoryRows,
} from './checkedInHistorySort';

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

function historyRow(
  partial: Partial<ProcessingWorkspaceItemDTO> & Pick<ProcessingWorkspaceItemDTO, 'id' | 'sku'>,
  itemCheckInId: number | null = null,
): CheckedInHistoryRow {
  const rowItem = item(partial);
  return {
    item: rowItem,
    items: [rowItem],
    qty: 1,
    itemCheckInId,
    itemCheckInCreatedAt: itemCheckInId != null ? '2026-06-01T12:00:00Z' : null,
    checkedInAt: rowItem.checked_in_at || rowItem.created_at || '',
  };
}

describe('checkedInHistorySort', () => {
  it('defaults to newest checked-in first', () => {
    const rows = [
      historyRow({ id: 1, sku: 'A', checked_in_at: '2026-06-01T10:00:00Z' }),
      historyRow({ id: 2, sku: 'B', checked_in_at: '2026-06-03T10:00:00Z' }),
    ];
    const sorted = sortCheckedInHistoryRows(rows, null, null);
    expect(sorted.map((r) => r.item.sku)).toEqual(['B', 'A']);
  });

  it('sorts qty ascending and descending', () => {
    const rows = [
      { ...historyRow({ id: 1, sku: 'A' }), qty: 3, checkedInAt: '2026-06-03T10:00:00Z' },
      { ...historyRow({ id: 2, sku: 'B' }), qty: 1, checkedInAt: '2026-06-01T10:00:00Z' },
    ];
    expect(sortCheckedInHistoryRows(rows, { field: 'qty', dir: 'asc' }, null).map((r) => r.qty)).toEqual([1, 3]);
    expect(sortCheckedInHistoryRows(rows, { field: 'qty', dir: 'desc' }, null).map((r) => r.qty)).toEqual([3, 1]);
  });

  it('cycles checked-in sort desc -> asc -> default', () => {
    expect(cycleCheckedInSort(null, 'checkedIn')).toEqual({ field: 'checkedIn', dir: 'desc' });
    expect(cycleCheckedInSort({ field: 'checkedIn', dir: 'desc' }, 'checkedIn')).toEqual({ field: 'checkedIn', dir: 'asc' });
    expect(cycleCheckedInSort({ field: 'checkedIn', dir: 'asc' }, 'checkedIn')).toBeNull();
  });

  it('formats product and item summaries', () => {
    const row = historyRow({
      id: 1,
      sku: 'A',
      product_number: 'PRD-1',
      product_brand: 'Acme',
      product_title: 'Widget',
      product_model: 'X1',
      retail: '25.00',
      price: '12.00',
      location: 'back_storage',
    });
    expect(formatCheckedInProductSummary(row, null)).toContain('PRD-1');
    expect(formatCheckedInProductSummary(row, null)).toContain('Widget');
    expect(formatCheckedInItemSummary(row.item)).toContain('$12.00');
    expect(formatCheckedInItemSummary(row.item)).toContain('Back storage');
    expect(checkedInBrandText(row, null)).toBe('Acme');
    expect(checkedInTitleText(row, null)).toBe('Widget');
  });

  it('formats prior check-ins from current check-in product when item labels are stale', () => {
    const row = {
      ...historyRow({
        id: 1,
        sku: 'A',
        product: 42,
        product_number: 'OLD-42',
        product_brand: 'Old Brand',
        product_title: 'Old Title',
        product_model: 'Old Model',
      }),
      checkInProduct: {
        id: 42,
        product_number: 'NEW-42',
        title: 'New Title',
        brand: 'New Brand',
        model: 'New Model',
        specs: {},
        identifiers: {},
        tags: [],
        taxonomy: '',
        category: 'New Category',
        upc: '',
      },
    };
    expect(formatCheckedInProductSummary(row, null)).toContain('NEW-42');
    expect(formatCheckedInProductSummary(row, null)).toContain('New Title');
    expect(checkedInBrandText(row, null)).toBe('New Brand');
    expect(checkedInTitleText(row, null)).toBe('New Title');
  });
});

describe('buildCheckedInHistoryRows check-in grouping', () => {
  it('groups check-in items into one row with check-in quantity', () => {
    const items = [
      item({ id: 1, sku: 'A', checked_in_at: '2026-06-01T10:00:00Z' }),
      item({ id: 2, sku: 'B', checked_in_at: '2026-06-01T10:00:00Z' }),
      item({ id: 3, sku: 'C', checked_in_at: '2026-06-03T10:00:00Z' }),
    ];
    const rows = buildCheckedInHistoryRows(items, [
      {
        id: 9,
        quantity: 2,
        items: [items[0], items[1]],
        product: null,
        created_at: '2026-06-01T10:00:00Z',
        created_by: null,
        defaults: {},
        dispute_count: 0,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.item.sku).toBe('C');
    expect(rows[1]?.qty).toBe(2);
    expect(rows[1]?.items).toHaveLength(2);
  });
});
