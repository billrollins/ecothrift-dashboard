import { describe, expect, it } from 'vitest';
import type { TruckFinalizeDTO } from '../../../api/truckFinalize.api';
import { finalizeWarnings, pctText, refundRuleText, unitsText } from './truckFinalizeDisplay';

const zero = { manifest: 0, unfulfilled: 0, expected: 0, received: 0, missing: 0, over: 0, broken: 0 };
const zeroMoney = {
  manifest: '0.00', unfulfilled: '0.00', expected: '0.00', received: '0.00', missing: '0.00', over: '0.00', broken: '0.00',
};

const base = (over: Partial<TruckFinalizeDTO> = {}): TruckFinalizeDTO => ({
  order: {
    id: 1, order_number: 'PO-1', vendor: 'V', description: '', status: 'processing', purchase_cost: '200.00',
    fees: null, shipping_cost: null, delivered_date: null, has_manifest: true,
  },
  finalized: { at: null, by: '', snapshot: {} },
  totals: {
    lines: 2, lines_without_retail: 0, units: zero, retail: zeroMoney, added_units: 0, added_retail: '0.00',
    missing_pct: 0, adjusted_refund: '0.00',
  },
  refund: {
    sale_price: '200.00', rate: 0.95, deductible: 0.05, claimed_retail: '0.00', claimed_pct: 0,
    not_refunded_retail: '0.00', refundable_retail: '0.00', refundable_share: 0, amount: '0.00',
  },
  pallets: { total: 2, arrived: 2, done: 2 },
  pending_units: 0,
  adjustments: [],
  lines: [],
  lines_shown: 'problems',
  ...over,
});

describe('truckFinalizeDisplay', () => {
  it('has no warnings for a finished truck', () => {
    expect(finalizeWarnings(base())).toEqual([]);
  });

  it('warns about pending units, open pallets and no sale price', () => {
    const w = finalizeWarnings(
      base({
        pending_units: 3,
        pallets: { total: 4, arrived: 4, done: 1 },
        order: { ...base().order, purchase_cost: null },
      }),
    );
    expect(w).toHaveLength(3);
    expect(w[1]).toBe('3 of 4 pallets are not marked done in Processing.');
  });

  it('formats', () => {
    expect(pctText(null)).toBe('-');
    expect(pctText(4.25)).toBe('4.3%');
    expect(unitsText(1200)).toBe('1,200');
    expect(refundRuleText(0.95, 0.05)).toContain('95% of the sale price');
    expect(refundRuleText(0.95, 0.05)).toContain('first 5% of the manifest retail');
  });
});
