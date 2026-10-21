import { describe, expect, it } from 'vitest';
import { buildReceiptData, NON_MEMBER_RECEIPT_LINE, receiptLineFromCartLine, saleSuffix } from './posReceipt';
import type { Cart, CartLine, ThriftPlusCartBlock } from '../types/pos.types';

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

  it("uses the server's sale name when it sends one (owner-named sales, REG-21)", () => {
    expect(saleSuffix(line({ sale_label: 'summer', sale_percent: '30', sale_display: 'Patio 30%' }))).toBe(' (Patio 30%)');
    expect(saleSuffix(line({ sale_label: 'summer', sale_percent: '30' }))).toBe(' (30% Summer)');
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

  it('flags a training sale for the print server and says TRAINING in the fields', () => {
    const data = buildReceiptData(
      cart({ status: 'training', receipt: { id: 2, cart: 1, receipt_number: 'TRAIN-20261014-001', printed: false, emailed: false, created_at: '2026-10-14T15:00:00Z' } }),
    );
    expect(data.training).toBe(true);
    expect(data.cashier).toBe('TRAINING - Bill');
    expect(data.payment_method).toBe('TRAINING - NOT A SALE (cash)');
  });

  it('leaves a real receipt without the training key (payload unchanged)', () => {
    const data = buildReceiptData(cart({}));
    expect('training' in data).toBe(false);
    expect(Object.keys(data)).toEqual([
      'receipt_number', 'date', 'time', 'cashier', 'items', 'subtotal', 'tax', 'total', 'payment_method',
      'amount_tendered', 'change', 'card_amount', 'card_type', 'card_surcharge', 'card_charged_total',
      'card_surcharge_percent', 'savings', 'you_saved', 'thrift_plus',
    ]);
    expect(data.cashier).toBe('Bill');
    expect(data.payment_method).toBe('cash');
  });
});

describe('Thrift+ on the receipt (the 10-12 policy)', () => {
  const MEMBER = {
    account_id: 1, person_id: 1, name: 'Ana Diaz', first_name: 'Ana', role: 'primary' as const, photo_url: null, verified_18: true,
    card_last4: '0008', practice: false, choice: 'bank' as const, rering: false,
  };

  function block(over: Partial<ThriftPlusCartBlock> = {}): ThriftPlusCartBlock {
    return {
      live: true, member: MEMBER, instant_offered: false, instant_reason: '', instant_share: '0.50', collected: '35.00',
      use_by: '2026-11-19', instant_bucks: '0.00', instant_off: '0.00', bucks_auto: true, bucks_available: '35.00',
      bucks_used: '33.27', credit_available: '50.00', credit_used: '50.00',
      balances: { bucks: '1.73', bucks_use_by: '2026-11-02', credit: '0.00' }, guest_line: '',
      lines: {
        '7': { reward: '35.00', savings: '0.00', mark: '3-day return' },
        '8': { reward: '0.00', savings: '0.00', mark: 'AS IS' },
      },
      bucks_line_id: 99, restricted_line_ids: [], amount_due: '0.00',
      ...over,
    };
  }

  const lamp = line({ id: 7, description: 'Brass lamp', quantity: 1, unit_price: '80.00', line_total: '80.00', line_kind: 'item' });
  const sweater = line({ id: 8, description: 'Wool sweater', quantity: 1, unit_price: '5.00', line_total: '5.00', line_kind: 'item' });
  const pinkTag = line({ id: 9, item: null, description: 'Pink tag', quantity: 1, unit_price: '2.00', line_total: '2.00', line_kind: 'manual' });
  const bucksLine = line({
    id: 99, item: null, description: 'ThriftBucks used', quantity: 1, unit_price: '-33.27', line_total: '-33.27', line_kind: 'discount',
    meta: { thrift: 'bucks', reason: 'ThriftBucks used' },
  });
  const delivery = line({ id: 10, item: null, description: 'Delivery', quantity: 1, unit_price: '50.00', line_total: '50.00', line_kind: 'delivery' });

  it('leaves a dark receipt exactly as before: no marks, no Thrift+ block, no training key', () => {
    const data = buildReceiptData(cart({ thrift_plus: null, lines: [lamp, sweater] }));
    expect(data.thrift_plus).toBeUndefined();
    expect('training' in data).toBe(false);
    expect(data.items).toEqual([
      { name: 'Brass lamp', quantity: 1, unit_price: 80, line_total: 80 },
      { name: 'Wool sweater', quantity: 1, unit_price: 5, line_total: 5 },
    ]);
  });

  it('marks every non-member line AS IS, sends the Non-member line, and says what membership would have collected', () => {
    const guestLine = 'This trip would have collected 35.00 ThriftBucks.';
    const data = buildReceiptData(cart({
      lines: [lamp, pinkTag, delivery],
      thrift_plus: block({
        member: null, guest_line: guestLine, bucks_used: '0.00', credit_used: '0.00', bucks_line_id: null,
        lines: { '7': { reward: '35.00', savings: '0.00', mark: 'AS IS', join_mark: '3-day return' } },
      }),
    }));
    expect(data.items).toEqual([
      // What joining would have given: "Join for: 3-day return · +35.00 ThriftBucks" (print server 1.9.2).
      { name: 'Brass lamp', quantity: 1, unit_price: 80, line_total: 80, mark: 'AS IS', bucks: 35, join_mark: '3-day return' },
      { name: 'Pink tag', quantity: 1, unit_price: 2, line_total: 2, mark: 'AS IS' },
      { name: 'Delivery', quantity: 1, unit_price: 50, line_total: 50 },
    ]);
    expect(data.thrift_plus).toEqual({
      member: null, collected: 35, use_by: null, instant_off: 0, instant_bucks: 0, bucks_used: 0, credit_used: 0,
      balances: null, guest_all_as_is: true, guest_line: guestLine,
      // Owner 2026-10-15: "Non-member" replaces "guest" wherever a customer reads.
      non_member_line: 'Non-member: All sales final. Sold AS IS.',
    });
    expect(NON_MEMBER_RECEIPT_LINE).toBe('Non-member: All sales final. Sold AS IS.');
    expect(JSON.stringify(data)).not.toMatch(/Guest/);
    expect('training' in data).toBe(false);
  });

  it("gives a member each line's mark, leaves the ThriftBucks line out of the items, and sends the B14 numbers", () => {
    const data = buildReceiptData(cart({ lines: [lamp, sweater, pinkTag, bucksLine], thrift_plus: block() }));
    expect(data.items).toEqual([
      { name: 'Brass lamp', quantity: 1, unit_price: 80, line_total: 80, mark: '3-day return', bucks: 35 },
      { name: 'Wool sweater', quantity: 1, unit_price: 5, line_total: 5, mark: 'AS IS' }, // no ThriftBucks: none sent
      { name: 'Pink tag', quantity: 1, unit_price: 2, line_total: 2, mark: 'AS IS' },
    ]);
    expect(data.thrift_plus).toEqual({
      member: 'Ana', // the first name only: no card, no last 4 (owner 2026-10-14)
      collected: 35,
      use_by: '2026-11-19',
      instant_off: 0,
      instant_bucks: 0,
      bucks_used: 33.27,
      credit_used: 50,
      balances: { bucks: 1.73, bucks_use_by: '2026-11-02', credit: 0 },
      guest_all_as_is: false,
    });
    const tp = data.thrift_plus as Record<string, unknown>;
    for (const gone of ['to_cover', 'cover_covered', 'cover_amount', 'banked', 'bank_used', 'lines', 'savings', 'to_bank']) {
      expect(tp).not.toHaveProperty(gone);
    }
  });

  it('sends the last day for 3-day returns for a member, only when the server gave one', () => {
    const sent = buildReceiptData(cart({ lines: [lamp], thrift_plus: block({ returns_until: '2026-10-23' }) }));
    expect(sent.returns_until).toBe('2026-10-23');
    const stamped = buildReceiptData(cart({ lines: [lamp], thrift_plus: block({ returns_until: '2026-10-23T00:00:00Z' }) }));
    expect(stamped.returns_until).toBe('2026-10-23');
    const older = buildReceiptData(cart({ lines: [lamp], thrift_plus: block() })); // an older server: no key
    expect('returns_until' in older).toBe(false);
    const guest = buildReceiptData(cart({
      lines: [lamp], thrift_plus: block({ member: null, guest_line: 'x', bucks_line_id: null, returns_until: '2026-10-23' }),
    }));
    expect('returns_until' in guest).toBe(false);
  });

  it('prints the first name only and never a card or its last 4 (owner 2026-10-14: no Thrift+ card)', () => {
    const member = buildReceiptData(cart({ lines: [lamp, bucksLine], thrift_plus: block() }));
    const older = buildReceiptData(cart({ lines: [lamp], thrift_plus: block({ member: { ...MEMBER, first_name: undefined } }) }));
    const guest = buildReceiptData(cart({ lines: [lamp], thrift_plus: block({ member: null, guest_line: 'x', bucks_line_id: null }) }));
    expect((older.thrift_plus as Record<string, unknown>).member).toBe('Ana'); // an older server: the first word of the name
    for (const data of [member, older, guest]) {
      const text = JSON.stringify(data.thrift_plus);
      expect(text).not.toMatch(/card/i);
      expect(text).not.toContain('0008');
      expect(text).not.toContain('Diaz');
    }
  });

  it('sends a redeemed-instantly trip in dollars off', () => {
    const data = buildReceiptData(cart({
      lines: [lamp],
      thrift_plus: block({
        member: { ...MEMBER, choice: 'instant' }, instant_bucks: '35.00', instant_off: '17.50', bucks_used: '0.00', credit_used: '0.00',
        bucks_line_id: null,
      }),
    }));
    expect(data.thrift_plus).toMatchObject({ instant_bucks: 35, instant_off: 17.5, bucks_used: 0 });
  });

  it('flags a training sale at the top level', () => {
    const data = buildReceiptData(cart({ status: 'training', lines: [lamp], thrift_plus: block({ bucks_used: '0.00', bucks_line_id: null }) }));
    expect(data.training).toBe(true);
    expect(data.cashier).toBe('TRAINING - Bill');
    expect(data.payment_method).toBe('TRAINING - NOT A SALE (cash)');
    const dark = buildReceiptData(cart({ status: 'training', lines: [lamp], thrift_plus: null }));
    expect(dark.training).toBe(true);
    expect(dark.items).toEqual([{ name: 'Brass lamp', quantity: 1, unit_price: 80, line_total: 80 }]);
  });
});
