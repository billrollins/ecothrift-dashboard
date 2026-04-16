import type { BuyingAuctionDetail } from '../types/buying.types';

/**
 * Max hammer at a given profit multiple (revenue ÷ total acquisition vs hammer):
 * (effective_revenue_after_shrink / factor) − fees − shipping.
 */
export function computeMaxBidAtProfitFactor(detail: BuyingAuctionDetail, factor: number): number | null {
  const eff = Number.parseFloat(detail.effective_revenue_after_shrink ?? '');
  const fees = Number.parseFloat(detail.estimated_fees ?? '');
  const ship = Number.parseFloat(detail.estimated_shipping ?? '');
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    !Number.isFinite(eff) ||
    !Number.isFinite(fees) ||
    !Number.isFinite(ship)
  ) {
    return null;
  }
  return eff / factor - fees - ship;
}

/**
 * Max hammer where profitability would still meet profit factor:
 * uses `profit_target_override` when set, otherwise 2.0.
 */
export function computeMaxBid(detail: BuyingAuctionDetail): number | null {
  const factorRaw = detail.profit_target_override;
  const factor =
    factorRaw != null && factorRaw !== '' ? Number.parseFloat(String(factorRaw)) : 2.0;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return computeMaxBidAtProfitFactor(detail, factor);
}
