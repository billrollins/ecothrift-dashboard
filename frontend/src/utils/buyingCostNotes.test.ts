import { describe, expect, it } from 'vitest';
import type { BuyingAuctionDetail } from '../types/buying.types';
import { feesNote, shippingCaption, shippingNote } from './buyingCostNotes';

function detail(fields: Partial<BuyingAuctionDetail>): BuyingAuctionDetail {
  return fields as unknown as BuyingAuctionDetail;
}

describe('feesNote', () => {
  it('names the B-Stock fee rate, or your own number', () => {
    expect(feesNote(detail({ fee_rate_applied: '0.0500' }), false)).toBe('B-Stock fee, 5% of price');
    expect(feesNote(detail({ fee_rate_applied: null }), true)).toBe('Your number');
    expect(feesNote(detail({ fee_rate_applied: '0' }), false)).toBeNull();
  });
});

describe('shippingNote', () => {
  it('names the B-Stock quote', () => {
    const d = detail({ shipping_source: 'quote', shipping_quote_info: { carrier: 'RXO Logistics', trucks: 1 } });
    expect(shippingNote(d, false)).toBe('B-Stock quote (RXO Logistics, 1 truck)');
  });

  it('describes a formula estimate by load type, city, and miles', () => {
    const truck = detail({
      shipping_source: 'estimate',
      shipping_estimate: { basis: 'formula', amount: '3649.67', mode: 'truckload', pallets: 27, miles: 1186, city: 'Breinigsville, PA' },
    });
    expect(shippingNote(truck, false)).toBe('Estimate, truckload from Breinigsville, PA (1,186 mi)');
    const ltl = detail({
      shipping_source: 'estimate',
      shipping_estimate: { basis: 'formula', amount: '531.00', mode: 'ltl', pallets: 3, miles: 319, city: 'Owatonna, MN' },
    });
    expect(shippingNote(ltl, false)).toBe('Estimate, 3 pallets LTL from Owatonna, MN (319 mi)');
  });

  it('shows pallets x the default rate when the distance is unknown', () => {
    const d = detail({
      shipping_source: 'estimate',
      shipping_estimate: { basis: 'pallets', amount: '100.00', pallets: 1, per_pallet: '100', city: '' },
    });
    expect(shippingNote(d, false)).toBe('Estimate, 1 pallet x $100 (default rate)');
  });

  it('falls back to a share of the price', () => {
    const d = detail({ shipping_source: 'estimate', shipping_rate_applied: '0.4000', shipping_estimate: { basis: 'rate', amount: '400.00' } });
    expect(shippingNote(d, false)).toBe('Estimate, 40% of price');
    expect(shippingNote(d, true)).toBe('Your number');
  });
});

describe('shippingCaption', () => {
  it('gives the formula range', () => {
    const d = detail({
      shipping_source: 'estimate',
      shipping_estimate: {
        basis: 'formula', amount: '3649.67', mode: 'truckload', pallets: 27, miles: 1186, city: 'Breinigsville, PA', low: '2737.25', high: '4562.09',
      },
    });
    expect(shippingCaption(d)).toContain('Past orders say $2,737 to $4,562.');
  });

  it('points to Assumptions when the distance is unknown', () => {
    const d = detail({
      shipping_source: 'estimate',
      shipping_estimate: { basis: 'pallets', amount: '2300.00', pallets: 23, per_pallet: '100', city: 'Pittston, PA' },
    });
    expect(shippingCaption(d)).toContain('We do not know how far Pittston, PA is yet');
  });

  it('describes the B-Stock quote', () => {
    const d = detail({ shipping_source: 'quote', shipping_quote_info: { destination_zip: '68124', mode: 'TL' } });
    expect(shippingCaption(d)).toContain("B-Stock's quote to 68124 (TL)");
  });
});
