import { describe, expect, it } from 'vitest';
import type { Cart } from '../types/pos.types';
import { paymentMethodLabel, thriftCoversSale, thriftPaymentParts } from './posPayment';
import { buildReceiptData } from './posReceipt';

function cart(over: Partial<Cart>): Cart {
  return {
    id: 1, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '50.62',
    tax_rate: '0.07', tax_amount: '3.54', total: '54.16', payment_method: 'cash', cash_tendered: null,
    change_given: null, card_amount: null, completed_at: null, created_at: '2026-10-20T16:56:00Z',
    lines: [{ id: 9, line_kind: 'item', line_total: '50.62' }], thrift_credit: '0.00', ...over,
  } as unknown as Cart;
}

describe('posPayment', () => {
  it('names Thrift+ and the other methods', () => {
    expect(paymentMethodLabel('thrift')).toBe('Thrift+');
    expect(paymentMethodLabel('payroll')).toBe('Payroll deduction');
    expect(paymentMethodLabel('cash')).toBe('Cash');
  });

  it('R-20261020-009: credit that covers it all means nothing to pay', () => {
    const c = cart({ thrift_credit: '54.16' });
    expect(thriftCoversSale(c)).toBe(true);
    expect(thriftPaymentParts(c)).toEqual(['Thrift+ credit $54.16']);
  });

  it('ThriftBucks (no $) and credit show together; cash still due is not covered', () => {
    const c = cart({
      total: '20.00',
      thrift_credit: '20.00',
      lines: [
        { id: 9, line_kind: 'item', line_total: '50.62' },
        { id: 10, line_kind: 'discount', line_total: '-31.93', meta: { thrift: 'bucks' } },
      ] as Cart['lines'],
    });
    expect(thriftPaymentParts(c)).toEqual(['Paid with ThriftBucks 31.93', 'Thrift+ credit $20.00']);
    expect(thriftCoversSale(c)).toBe(true);
    expect(thriftCoversSale(cart({ thrift_credit: '10.00' }))).toBe(false);
    expect(thriftCoversSale(cart({ total: '0.00', thrift_credit: '0.00' }))).toBe(false); // $0, but not Thrift+
  });

  it('a reprint says COPY (and which copy after the first)', () => {
    const c = cart({ status: 'completed', receipt: { receipt_number: 'R-20261020-009' } as Cart['receipt'] });
    expect(buildReceiptData(c).receipt_number).toBe('R-20261020-009');
    expect(buildReceiptData(c).copy).toBeUndefined();
    expect(buildReceiptData(c, { copy: 1 })).toMatchObject({ receipt_number: 'R-20261020-009 COPY', copy: true });
    expect(buildReceiptData(c, { copy: 2 }).receipt_number).toBe('R-20261020-009 COPY 2');
  });

  it('the receipt says Thrift+ and no cash', () => {
    const data = buildReceiptData(cart({ status: 'completed', payment_method: 'thrift', thrift_credit: '54.16' }));
    expect(data.payment_method).toBe('Thrift+');
    expect(data.amount_tendered).toBeUndefined();
    expect(data.change).toBeUndefined();
  });
});
