import { describe, expect, it } from 'vitest';
import type { ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow } from './checkedInHistory';
import {
  CHECKED_IN_HISTORY_AUTOSIZE_COLS,
  CHECKED_IN_HISTORY_COL_DEFAULTS,
  CHECKED_IN_HISTORY_BRAND_COL_PX,
  CHECKED_IN_HISTORY_CATEGORY_COL_PX,
  CHECKED_IN_HISTORY_ITEM_ENUM_COLS,
  CHECKED_IN_HISTORY_DISPATCH_COL_PX,
  CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX,
  CHECKED_IN_HISTORY_ITEM_ENUM_COL_MAX_PX,
  CHECKED_IN_HISTORY_MODEL_COL_PX,
  CHECKED_IN_HISTORY_MONEY_COLS,
  CHECKED_IN_HISTORY_MONEY_COL_MAX_PX,
  CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX,
  CHECKED_IN_HISTORY_QTY_MIN_PX,
  CHECKED_IN_HISTORY_TITLE_MIN_PX,
  computeCheckedInHistoryColumnWidths,
  createCheckedInHistoryMeasureFonts,
  distributeCheckedInHistoryColumnWidths,
  type MeasureTextWidthFn,
} from './checkedInHistoryColumnLayout';

const fonts = createCheckedInHistoryMeasureFonts('Inter, sans-serif');
const stubMeasure: MeasureTextWidthFn = (text) => text.length * 8;

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
  qty = 1,
): CheckedInHistoryRow {
  const rowItem = item(partial);
  return {
    item: rowItem,
    items: [rowItem],
    qty,
    itemCheckInId: 1,
    itemCheckInCreatedAt: '2026-06-01T12:00:00Z',
    checkedInAt: rowItem.checked_in_at || '',
  };
}

describe('distributeCheckedInHistoryColumnWidths', () => {
  it('uses fixed brand/model/category widths and enum/money tiers', () => {
    const measured = {
      checkedIn: 90,
      qty: 52,
      productId: 80,
      brand: 120,
      title: 200,
      model: 120,
      category: 200,
      condition: 200,
      dispatch: 200,
      retail: 90,
      price: 90,
    };
    const { cols, productColPx, itemEnumColPx, moneyColPx } = distributeCheckedInHistoryColumnWidths(measured, 1800);
    expect(cols.productId).toBe(CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX);
    expect(cols.brand).toBe(CHECKED_IN_HISTORY_BRAND_COL_PX);
    expect(cols.model).toBe(CHECKED_IN_HISTORY_MODEL_COL_PX);
    expect(cols.category).toBe(CHECKED_IN_HISTORY_CATEGORY_COL_PX);
    expect(productColPx).toBe(CHECKED_IN_HISTORY_BRAND_COL_PX);
    expect(itemEnumColPx).toBe(CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX);
    expect(cols.condition).toBe(CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX);
    expect(cols.dispatch).toBe(CHECKED_IN_HISTORY_DISPATCH_COL_PX);
    expect(cols.dispatch).toBeGreaterThan(cols.condition);
    expect(moneyColPx).toBeLessThanOrEqual(CHECKED_IN_HISTORY_MONEY_COL_MAX_PX);
    expect(cols.category).toBeGreaterThan(cols.brand);
    expect(cols.category).toBeGreaterThan(itemEnumColPx);
    expect(itemEnumColPx).toBeGreaterThan(moneyColPx);
    expect(cols.condition).toBe(itemEnumColPx);
    for (const id of CHECKED_IN_HISTORY_ITEM_ENUM_COLS) {
      expect(cols[id]).toBe(itemEnumColPx);
    }
    for (const id of CHECKED_IN_HISTORY_MONEY_COLS) {
      expect(cols[id]).toBe(moneyColPx);
    }
  });

  it('leaves autosize columns at measured width, fixes product id, and gives title the remainder', () => {
    const measured = { ...CHECKED_IN_HISTORY_COL_DEFAULTS };
    const { cols } = distributeCheckedInHistoryColumnWidths(measured, 2000);
    for (const id of CHECKED_IN_HISTORY_AUTOSIZE_COLS) {
      expect(cols[id]).toBe(measured[id]);
    }
    expect(cols.productId).toBe(CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX);
    expect(cols.title).toBeGreaterThanOrEqual(CHECKED_IN_HISTORY_TITLE_MIN_PX);
    expect(Object.values(cols).reduce((a, b) => a + b, 0)).toBe(2000);
  });
});

describe('computeCheckedInHistoryColumnWidths', () => {
  it('fills container width including actions', () => {
    const layout = computeCheckedInHistoryColumnWidths([], 900, null, fonts, { showReprint: true }, stubMeasure);
    const dataSum = Object.values(layout.cols).reduce((a, b) => a + b, 0);
    expect(dataSum + layout.actionsColPx).toBe(900);
  });

  it('keeps qty wide enough and preserves tier ordering', () => {
    const rows = [historyRow({ id: 1, sku: 'A', product_title: 'Widget' })];
    const layout = computeCheckedInHistoryColumnWidths(rows, 1800, null, fonts, { showReprint: true }, stubMeasure);
    expect(layout.cols.qty).toBeGreaterThanOrEqual(CHECKED_IN_HISTORY_QTY_MIN_PX);
    expect(layout.cols.brand).toBe(CHECKED_IN_HISTORY_BRAND_COL_PX);
    expect(layout.cols.category).toBe(CHECKED_IN_HISTORY_CATEGORY_COL_PX);
    expect(layout.cols.category).toBeGreaterThan(layout.cols.condition);
    expect(layout.cols.dispatch).toBe(CHECKED_IN_HISTORY_DISPATCH_COL_PX);
    expect(layout.cols.dispatch).toBeGreaterThan(layout.cols.condition);
  });
});
