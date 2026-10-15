import { describe, expect, it } from 'vitest';
import type { Cart, CartLine, ThriftPlusCartBlock } from '../types/pos.types';
import {
  amountDue,
  bucksUsed,
  creditUsed,
  instantOffer,
  instantOffOnLines,
  isBucksLine,
  needsCardTender,
  practiceCardPayload,
  reringMessage,
  saleSavings,
} from './thriftPlusRegister';

function line(partial: Partial<CartLine>): CartLine {
  return {
    id: 1, cart: 1, item: 1, description: 'Lamp', quantity: 1, unit_price: '80.00', line_total: '80.00', line_kind: 'item',
    created_at: '2026-10-20T15:00:00Z', ...partial,
  };
}

function cart(partial: Partial<Cart> = {}): Cart {
  return {
    id: 3, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '80.00', tax_rate: '0.0700',
    tax_amount: '5.60', total: '85.60', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
    completed_at: null, created_at: '2026-10-20T15:00:00Z', lines: [], ...partial,
  };
}

function block(over: Partial<ThriftPlusCartBlock> = {}): ThriftPlusCartBlock {
  return {
    live: true,
    member: {
      account_id: 1, person_id: 1, name: 'Ana Diaz', role: 'primary', photo_url: null, verified_18: true, card_last4: '0008',
      practice: false, choice: 'bank', rering: false,
    },
    instant_offered: true, instant_reason: '', instant_share: '0.50', collected: '35.00', use_by: '2026-11-19',
    instant_bucks: '0.00', instant_off: '0.00', bucks_auto: true, bucks_available: '0.00', bucks_used: '0.00',
    credit_available: '0.00', credit_used: '0.00', balances: { bucks: '0.00', bucks_use_by: null, credit: '0.00' },
    guest_line: '', lines: {}, bucks_line_id: null, restricted_line_ids: [], amount_due: '85.60',
    ...over,
  };
}

describe('the terminal with Thrift+ dark', () => {
  it('takes the whole total and shows no Thrift+ rows', () => {
    const dark = cart({ lines: [line({ sale_savings: '8.00', line_total: '72.00' })], total: '77.04', thrift_plus: undefined });
    expect(amountDue(dark)).toBe(77.04);
    expect(creditUsed(dark)).toBe(0);
    expect(instantOffOnLines(dark)).toBe(0);
    expect(bucksUsed(dark)).toBe(0);
    expect(saleSavings(dark)).toBe(8);
    expect(amountDue(null)).toBe(0);
  });
});

describe('the terminal with a Thrift+ member', () => {
  it('takes the Thrift+ credit off the total after tax (amount due = total - credit used)', () => {
    expect(amountDue(cart({ total: '85.60', thrift_credit: '50.00', thrift_plus: block({ credit_used: '50.00' }) }))).toBe(35.6);
    // B14: the credit pays all of it once 33.27 ThriftBucks come off before tax.
    expect(amountDue(cart({ total: '50.00', thrift_credit: '50.00', thrift_plus: block({ credit_used: '50.00' }) }))).toBe(0);
  });

  it('finds the ThriftBucks line by its id (or its Thrift+ mark) and keeps it out of "Sale savings"', () => {
    const bucks = line({ id: 99, item: null, line_kind: 'discount', unit_price: '-33.27', line_total: '-33.27', sale_savings: '0.00' });
    const marked = line({ id: 100, item: null, line_kind: 'discount', meta: { thrift: 'bucks' } });
    const other = line({ id: 101, item: null, line_kind: 'discount', meta: { reason: 'Google Review' } });
    const c = cart({ lines: [line({ id: 7 }), bucks], thrift_plus: block({ bucks_line_id: 99, bucks_used: '33.27' }) });
    expect(isBucksLine(c, bucks)).toBe(true);
    expect(isBucksLine(c, marked)).toBe(true);
    expect(isBucksLine(c, other)).toBe(false);
    expect(isBucksLine(cart(), line({ id: 99 }))).toBe(false);
    expect(bucksUsed(c)).toBe(33.27);
    expect(saleSavings(c)).toBe(0);
  });

  it('adds up the dollars redeemed instantly on the lines, apart from the sale percents', () => {
    const c = cart({
      lines: [
        line({ id: 7, thrift_savings: '17.50', sale_savings: '17.50', line_total: '62.50' }),
        line({ id: 8, thrift_savings: '0.00', sale_savings: '2.00', sale_label: 'labor_day', line_total: '18.00', unit_price: '20.00' }),
      ],
      thrift_plus: block(),
    });
    expect(instantOffOnLines(c)).toBe(17.5);
    expect(saleSavings(c)).toBe(2);
  });

  it('offers instant redemption at the share, rounded up to the cent (B1)', () => {
    expect(instantOffer(block())).toBe(17.5);
    expect(instantOffer(block({ collected: '0.75' }))).toBe(0.38);
    expect(instantOffer(block({ collected: '0.00' }))).toBe(0);
    // The server's figure wins when it sends one (capped at what is left to pay).
    expect(instantOffer(block({ instant_offer: '5.23' }))).toBe(5.23);
    expect(instantOffer(block({ member: { ...block().member!, choice: 'instant' }, instant_off: '12.00' }))).toBe(12);
  });

  it('words a re-ring as kept ThriftBucks, usable from tomorrow (owner 10-14)', () => {
    expect(reringMessage('Ana', cart({ thrift_plus: block() }))).toBe(
      'Re-rung for Ana: 35.00 ThriftBucks kept, usable from tomorrow, use by Nov 19.',
    );
    expect(reringMessage(null, cart({ thrift_plus: block({ collected: '0.00' }) }))).toBe(
      'Re-rung for Ana Diaz. This trip collects no ThriftBucks.',
    );
  });
});

describe('the training register (C1): the TEST screen before any card step', () => {
  it('never opens the card tender on the training register', () => {
    expect(needsCardTender('card', true)).toBe(false);
    expect(needsCardTender('split', true)).toBe(false);
    expect(needsCardTender('card', false)).toBe(true);
    expect(needsCardTender('split', false)).toBe(true);
    expect(needsCardTender('cash', false)).toBe(false);
    expect(needsCardTender('payroll', false)).toBe(false);
  });

  it('records a practice card sale as a debit card with no surcharge, and leaves cash alone', () => {
    expect(practiceCardPayload({ payment_method: 'card', card_amount: 85.6, card_charged_total: '88.17' })).toEqual({
      payment_method: 'card', card_amount: 85.6, card_type: 'debit',
    });
    expect(practiceCardPayload({ payment_method: 'split', cash_tendered: 20, card_amount: 65.6 })).toEqual({
      payment_method: 'split', cash_tendered: 20, card_amount: 65.6, card_type: 'debit',
    });
    expect(practiceCardPayload({ payment_method: 'cash', cash_tendered: 100 })).toEqual({ payment_method: 'cash', cash_tendered: 100 });
  });
});
