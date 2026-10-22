import { describe, expect, it } from 'vitest';
import {
  ratePer100,
  readTagErrorFilters,
  shouldBe,
  tagErrorListParams,
  tagErrorsLink,
  tagSaid,
  traceLine,
} from './tagErrors';

describe('tag errors URL state', () => {
  it('reads the filters, falling back to this week, every reason, all', () => {
    const f = readTagErrorFilters(new URLSearchParams('week=2026-W42&reason=price_low&show=open&processor=7&po=12'), '2026-W43');
    expect(f).toEqual({ week: '2026-W42', reason: 'price_low', show: 'open', processor: 7, po: 12 });
    const junk = readTagErrorFilters(new URLSearchParams('week=lastweek&reason=nope&show=maybe&processor=x&po=-1'), '2026-W43');
    expect(junk).toEqual({ week: '2026-W43', reason: '', show: 'all', processor: null, po: null });
  });

  it('sends only the filters that are set', () => {
    expect(tagErrorListParams({ week: '2026-W43', reason: '', show: 'all', processor: null, po: null })).toEqual({ week: '2026-W43' });
    expect(tagErrorListParams({ week: '2026-W43', reason: 'wrong_item', show: 'fixed', processor: 3, po: 9 }))
      .toEqual({ week: '2026-W43', reason: 'wrong_item', show: 'fixed', processor: 3, po: 9 });
  });

  it('links in from Retail QA by processor or truck', () => {
    expect(tagErrorsLink({ week: '2026-W43', processor: 5 })).toBe('/inventory/tag-errors?week=2026-W43&processor=5');
    expect(tagErrorsLink({ week: '2026-W43', po: 88 })).toBe('/inventory/tag-errors?week=2026-W43&po=88');
    expect(tagErrorsLink({ week: '2026-W43' })).toBe('/inventory/tag-errors?week=2026-W43');
  });
});

describe('tag errors display', () => {
  it('shows what the tag said and what it should be', () => {
    expect(tagSaid({ tag_price: '14', tag_retail: '70' })).toBe('$14.00 · retail $70.00');
    expect(tagSaid({ tag_price: '14', tag_retail: null })).toBe('$14.00');
    expect(tagSaid({ tag_price: null, tag_retail: null })).toBe('-');
    expect(shouldBe({ right_price: '9.5', right_retail: null })).toBe('$9.50');
    expect(shouldBe({ right_price: null, right_retail: '40' })).toBe('retail $40.00');
    expect(shouldBe({ right_price: null, right_retail: null })).toBe('');
  });

  it('traces the truck, manifest row and pallet', () => {
    const trace = {
      checked_in_by: 'Maria',
      checked_in_by_id: 4,
      checked_in_at: null,
      purchase_order_id: 12,
      order_number: 'PO-1234',
      manifest_row_id: 99,
      manifest_row_number: 56,
      pallet: { id: 3, number: 3, code: 'P3' },
    };
    expect(traceLine(trace)).toBe('PO-1234 · row 56 · pallet 3');
    expect(traceLine({ ...trace, order_number: '', manifest_row_number: null, pallet: null })).toBe('-');
  });

  it('rates errors per 100 tags checked in, only when some were', () => {
    expect(ratePer100(3, 120)).toBe(2.5);
    expect(ratePer100(1, 3)).toBe(33.3);
    expect(ratePer100(2, 0)).toBeNull();
  });
});
