import { describe, expect, it } from 'vitest';
import {
  formatRichSearch,
  itemFiltersToApiParams,
  checkInFiltersToApiParams,
  inventoryWorkbenchUrl,
  legacyItemParamsToRichSearch,
  manageItemsSearchUrl,
  parseRichSearch,
  parseWorkbenchSelection,
  removeRichSearchFilter,
} from './richInventorySearch';

describe('parseRichSearch', () => {
  it('splits free text from structured filters', () => {
    const parsed = parseRichSearch('fire truck {product=261453; status=sold; checkin=38263748}');
    expect(parsed.text).toBe('fire truck');
    expect(parsed.filters).toEqual({
      product: '261453',
      status: 'sold',
      checkin: '38263748',
    });
  });

  it('normalizes check_in alias to checkin', () => {
    const parsed = parseRichSearch('{check_in=100}');
    expect(parsed.filters.checkin).toBe('100');
  });

  it('ignores removed batch alias', () => {
    const parsed = parseRichSearch('{batch=99; checkin=100}');
    expect(parsed.filters.checkin).toBe('100');
    expect(parsed.filters.batch).toBeUndefined();
  });

  it('accepts comma-separated pairs', () => {
    const parsed = parseRichSearch('{product=1, status=on_shelf}');
    expect(parsed.filters).toEqual({ product: '1', status: 'on_shelf' });
  });
});

describe('formatRichSearch', () => {
  it('formats filters in stable order', () => {
    expect(
      formatRichSearch({
        filters: { checkin: 123, product: 261453 },
        entity: 'items',
      }),
    ).toBe('{product=261453; checkin=123}');
  });

  it('combines text and filters', () => {
    expect(
      formatRichSearch({
        text: 'drill',
        filters: { product: 5 },
        entity: 'items',
      }),
    ).toBe('drill {product=5}');
  });
});

describe('itemFiltersToApiParams', () => {
  it('maps checkin to item_check_in and prefers checkin over ids', () => {
    const parsed = parseRichSearch('{checkin=42; ids=1,2}');
    expect(itemFiltersToApiParams(parsed)).toMatchObject({
      item_check_in: '42',
      ids: undefined,
    });
  });
});

describe('removeRichSearchFilter', () => {
  it('removes one filter while keeping text', () => {
    expect(removeRichSearchFilter('foo {product=1; status=sold}', 'status')).toBe('foo {product=1}');
  });
});

describe('legacyItemParamsToRichSearch', () => {
  it('converts legacy URL params', () => {
    const params = new URLSearchParams('product=261453&item_check_in=38263748');
    expect(legacyItemParamsToRichSearch(params)).toBe('{product=261453; checkin=38263748}');
  });
});

describe('manageItemsSearchUrl', () => {
  it('maps checkin filters for catalog API', () => {
    const parsed = parseRichSearch('{product=5; order=9; origin=processing}', 'checkins');
    expect(checkInFiltersToApiParams(parsed)).toMatchObject({
      product: '5',
      purchase_order: '9',
      origin: 'processing',
    });
  });

  it('builds encoded workbench items URL', () => {
    expect(
      manageItemsSearchUrl({ filters: { checkin: 38263748, product: 261453 } }),
    ).toBe('/inventory/workbench?tab=items&q=%7Bproduct%3D261453%3B+checkin%3D38263748%7D');
  });
});

describe('workbench URL helpers', () => {
  it('parses selected record tokens', () => {
    expect(parseWorkbenchSelection('item:42')).toEqual({ type: 'item', id: 42 });
    expect(parseWorkbenchSelection('checkin:99')).toEqual({ type: 'checkin', id: 99 });
    expect(parseWorkbenchSelection('product:7')).toEqual({ type: 'product', id: 7 });
    expect(parseWorkbenchSelection('bad')).toBeNull();
  });

  it('builds workbench URLs with tab, search, and selection', () => {
    expect(
      inventoryWorkbenchUrl({
        tab: 'items',
        q: 'ITM123',
        selected: { type: 'item', id: 123, label: 'ITM123' },
      }),
    ).toBe('/inventory/workbench?tab=items&q=ITM123&selected=item%3A123');
  });
});
