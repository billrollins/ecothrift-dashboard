import { describe, expect, it } from 'vitest';
import { receiptLineFromCartLine, saleSuffix } from './posReceipt';
import type { CartLine } from '../types/pos.types';

function line(partial: Partial<CartLine>): CartLine {
  return {
    id: 1,
    cart: 1,
    item: 1,
    description: 'Lamp',
    quantity: 2,
    unit_price: '20.00',
    line_total: '36.00',
    created_at: '2026-09-05T00:00:00Z',
    ...partial,
  };
}

describe('saleSuffix', () => {
  it('labels Labor Day and Summer', () => {
    expect(saleSuffix(line({ sale_label: 'labor_day', sale_percent: '10' }))).toBe(
      ' (10% Labor Day)',
    );
    expect(saleSuffix(line({ sale_label: 'summer', sale_percent: '50' }))).toBe(
      ' (50% Summer)',
    );
    expect(saleSuffix(line({ sale_label: '' }))).toBe('');
  });
});

describe('receiptLineFromCartLine', () => {
  it('uses effective unit price from line_total', () => {
    const item = receiptLineFromCartLine(
      line({ sale_label: 'labor_day', sale_percent: '10', line_total: '36.00' }),
    );
    expect(item.name).toBe('Lamp (10% Labor Day)');
    expect(item.unit_price).toBe(18);
    expect(item.line_total).toBe(36);
  });
});
