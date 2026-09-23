import { describe, expect, it } from 'vitest';
import type { BuyingAuctionDetail } from '../types/buying.types';
import { computeMaxBid, computeMaxBidAtProfitFactor } from './auctionMaxBid';

function detail(fields: Partial<BuyingAuctionDetail>): BuyingAuctionDetail {
  return fields as unknown as BuyingAuctionDetail;
}

describe('computeMaxBidAtProfitFactor', () => {
  it('treats fees and shipping as fixed when the payload has no rates', () => {
    const d = detail({ effective_revenue_after_shrink: '12000', estimated_fees: '400', estimated_shipping: '3000' });
    expect(computeMaxBidAtProfitFactor(d, 1)).toBeCloseTo(8600, 2);
  });

  it('solves for the B-Stock fee rate with a fixed shipping quote', () => {
    const d = detail({
      effective_revenue_after_shrink: '11974.89',
      estimated_fees: '426.25',
      estimated_shipping: '2732.33',
      fee_rate_applied: '0.0500',
      shipping_rate_applied: null,
      shipping_source: 'quote',
    });
    const bid = computeMaxBidAtProfitFactor(d, 1)!;
    // At the max bid, bid + 5% fee + quote spends exactly the revenue.
    expect(bid * 1.05 + 2732.33).toBeCloseTo(11974.89, 2);
  });

  it('solves for both rates when shipping is an estimate', () => {
    const d = detail({
      effective_revenue_after_shrink: '1000',
      estimated_fees: '50',
      estimated_shipping: '400',
      fee_rate_applied: '0.05',
      shipping_rate_applied: '0.40',
    });
    expect(computeMaxBidAtProfitFactor(d, 2)).toBeCloseTo(500 / 1.45, 2);
  });

  it('keeps an overridden fee fixed', () => {
    const d = detail({
      effective_revenue_after_shrink: '1000',
      estimated_fees: '10',
      estimated_shipping: '100',
      fee_rate_applied: null,
      shipping_rate_applied: null,
    });
    expect(computeMaxBidAtProfitFactor(d, 1)).toBeCloseTo(890, 2);
  });

  it('returns null without numbers or with a bad factor', () => {
    expect(computeMaxBidAtProfitFactor(detail({}), 1)).toBeNull();
    const d = detail({ effective_revenue_after_shrink: '1000', estimated_fees: '0', estimated_shipping: '0' });
    expect(computeMaxBidAtProfitFactor(d, 0)).toBeNull();
  });
});

describe('computeMaxBid', () => {
  it('uses the profit target override, else 2x', () => {
    const base = { effective_revenue_after_shrink: '1000', estimated_fees: '0', estimated_shipping: '0' };
    expect(computeMaxBid(detail(base))).toBeCloseTo(500, 2);
    expect(computeMaxBid(detail({ ...base, profit_target_override: '4' }))).toBeCloseTo(250, 2);
  });
});
