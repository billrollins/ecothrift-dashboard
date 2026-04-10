import type { BuyingAuctionDetail } from '../types/buying.types';

/**
 * Max hammer where profitability would still meet profit factor:
 * (effective_revenue_after_shrink / profit_factor) - fees - shipping
 */
export function computeMaxBid(detail: BuyingAuctionDetail): number | null {
  const eff = Number.parseFloat(detail.effective_revenue_after_shrink ?? '');
  const fees = Number.parseFloat(detail.estimated_fees ?? '');
  const ship = Number.parseFloat(detail.estimated_shipping ?? '');
  const factorRaw = detail.profit_target_override;
  const factor =
    factorRaw != null && factorRaw !== ''
      ? Number.parseFloat(String(factorRaw))
      : 2.0;
  if (
    !Number.isFinite(eff) ||
    !Number.isFinite(fees) ||
    !Number.isFinite(ship) ||
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    return null;
  }
  return eff / factor - fees - ship;
}
