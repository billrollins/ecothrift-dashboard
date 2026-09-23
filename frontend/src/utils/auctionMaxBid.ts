import type { BuyingAuctionDetail } from '../types/buying.types';

function rateOrNull(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Max hammer at a given profit multiple (revenue ÷ total acquisition vs hammer).
 * Costs that scale with the bid (B-Stock's fee %, a shipping-rate estimate) are solved for:
 * bid × (1 + fee rate + ship rate) + fixed costs = effective_revenue_after_shrink / factor.
 * Fixed costs are overrides and a B-Stock shipping quote. Without the rates (older payloads)
 * fees and shipping are taken as fixed at the current price.
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
  const feeRate = rateOrNull(detail.fee_rate_applied);
  const shipRate = rateOrNull(detail.shipping_rate_applied);
  const fixed = (feeRate == null ? fees : 0) + (shipRate == null ? ship : 0);
  return (eff / factor - fixed) / (1 + (feeRate ?? 0) + (shipRate ?? 0));
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
