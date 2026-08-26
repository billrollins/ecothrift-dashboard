import { describe, expect, it } from 'vitest';
import type { CartLine } from '../../types/pos.types';
import {
  applyGoogleReviewCap,
  discountBase,
  dollarsFromPercent,
  percentFromDollars,
} from './discountUtils';

function line(partial: Partial<CartLine> & Pick<CartLine, 'id' | 'line_total'>): CartLine {
  return {
    cart: 1,
    item: 1,
    description: 'Item',
    quantity: 1,
    unit_price: partial.line_total,
    resale_source_sku: undefined,
    line_kind: 'item',
    created_at: '',
    ...partial,
  };
}

describe('discountBase', () => {
  const lines = [
    line({ id: 1, line_total: '20.00' }),
    line({ id: 2, line_total: '10.00', line_kind: 'discount' }),
    line({ id: 3, line_total: '50.00', line_kind: 'delivery' }),
  ];

  it('sums non-discount lines for the whole ticket', () => {
    expect(discountBase(lines, 'ticket')).toBe(70);
  });

  it('uses the chosen line', () => {
    expect(discountBase(lines, 1)).toBe(20);
  });
});

describe('percent and dollar conversion', () => {
  it('takes 5% of 20 as $1.00', () => {
    expect(dollarsFromPercent(5, 20)).toBe(1);
  });

  it('reads $5 on $200 as 2.5%', () => {
    expect(percentFromDollars(5, 200)).toBe(2.5);
  });
});

describe('applyGoogleReviewCap', () => {
  it('leaves a $1.00 / 5% ticket alone', () => {
    expect(applyGoogleReviewCap(1, 20)).toBe(1);
  });

  it('caps a $10 / 5% of $200 ticket at $5', () => {
    expect(applyGoogleReviewCap(10, 200)).toBe(5);
  });
});
