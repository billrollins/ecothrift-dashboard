import { describe, expect, it } from 'vitest';
import { buildReceiptData, receiptLineFromCartLine, saleSuffix } from './posReceipt';
import type { Cart, CartLine } from '../types/pos.types';

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

function cart(partial: Partial<Cart>): Cart {
  return {
    id: 1,
    drawer: 1,
    cashier: 1,
    cashier_name: 'Bill',
    customer: null,
    status: 'completed',
    subtotal: '22.48',
    tax_rate: '0.0700',
    tax_amount: '1.57',
    total: '24.05',
    payment_method: 'cash',
    cash_tendered: '25.00',
    change_given: '0.95',
    card_amount: null,
    card_type: '',
    card_surcharge_rate: '0.0000',
    card_surcharge_amount: '0.00',
    card_charged_total: null,
    completed_at: '2026-09-07T18:12:00Z',
    created_at: '2026-09-07T18:00:00Z',
    lines: [],
    receipt: {
      id: 1,
      cart: 1,
      receipt_number: 'R-20260907-014',
      printed: true,
      emailed: false,
      created_at: '2026-09-07T18:12:00Z',
    },
    ...partial,
  };
}

describe('buildReceiptData', () => {
  it('passes numeric savings and you_saved when total is positive', () => {
    const data = buildReceiptData(
      cart({
        savings: {
          total: '6.50',
          lines: [
            { label: 'Labor Day 10%', amount: '4.00' },
            { label: 'Google Review', amount: '2.50' },
          ],
        },
      }),
    );
    expect(data.savings).toEqual({
      total: 6.5,
      lines: [
        { label: 'Labor Day 10%', amount: 4 },
        { label: 'Google Review', amount: 2.5 },
      ],
    });
    expect(data.you_saved).toBe(6.5);
  });

  it('omits you_saved when savings total is zero', () => {
    const data = buildReceiptData(cart({ savings: { total: '0.00', lines: [] } }));
    expect(data.you_saved).toBeUndefined();
  });

  it('passes card surcharge fields for a credit sale', () => {
    const data = buildReceiptData(
      cart({
        payment_method: 'card',
        cash_tendered: null,
        change_given: null,
        card_amount: '100.00',
        card_type: 'credit',
        card_surcharge_rate: '0.0300',
        card_surcharge_amount: '3.00',
        card_charged_total: '103.00',
      }),
    );
    expect(data.card_amount).toBe(100);
    expect(data.card_type).toBe('credit');
    expect(data.card_surcharge).toBe(3);
    expect(data.card_charged_total).toBe(103);
    expect(data.card_surcharge_percent).toBe(3);
  });
});

describe('Thrift+ on the receipt', () => {
  const totals = {
    item_count: 1, price_total: '90.00', reward_total: '13.00', to_cover: '10.00', savings: '3.00', to_bank: '0.00', member_total: '87.00',
  };

  it('is left out while Thrift+ is dark', () => {
    expect(buildReceiptData(cart({ thrift_plus: null })).thrift_plus).toBeUndefined();
  });

  it('gives a guest the would-have-earned line', () => {
    const data = buildReceiptData(cart({
      thrift_plus: {
        live: true, member: null, guest_line: 'No Thrift+ card today. You lost $3.00', totals, lines: {},
        restricted_line_ids: [], amount_due: '96.30',
      },
    }));
    expect(data.thrift_plus).toEqual({ guest_line: 'No Thrift+ card today. You lost $3.00' });
  });

  it('gives a member the tag and member price, the cover and balances', () => {
    const data = buildReceiptData(cart({
      lines: [line({ id: 7, description: 'Brass lamp', quantity: 1, unit_price: '90.00', line_total: '87.00', thrift_savings: '3.00' })],
      thrift_plus: {
        live: true,
        member: {
          account_id: 1, person_id: 1, name: 'Ana', role: 'primary', photo_url: null, verified_18: true, card_last4: '0008',
          choice: 'instant', rering: false, banked: '0.00', credit: '0.00',
          cover: { month: '2026-10', amount: '10.00', covered: '10.00', remaining: '0.00', is_covered: true, resets_on: '2026-11-01' },
        },
        credit_used: '0.00', bank_used: '0.00', guest_line: '', totals,
        lines: { '7': { reward: '13.00', to_cover: '10.00', savings: '3.00', to_bank: '0.00' } },
        restricted_line_ids: [], amount_due: '93.09',
      },
    }));
    expect(data.thrift_plus).toMatchObject({
      member: 'Ana',
      lines: [{ name: 'Brass lamp', tag_price: 90, member_price: 87, reward: 13 }],
      to_cover: 10,
      savings: 3,
      cover_covered: 10,
      cover_amount: 10,
    });
  });
});
