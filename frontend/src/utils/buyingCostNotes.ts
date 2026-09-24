import type { BuyingAuctionDetail } from '../types/buying.types';
import { formatCurrencyWhole } from './format';
import { parseDec } from './valuationParse';

function ratePct(raw: string | null | undefined): string | null {
  const n = parseDec(raw ?? '');
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return `${Number((n * 100).toFixed(1))}%`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Where the fees number comes from, in a few words (under the Fees input). */
export function feesNote(detail: BuyingAuctionDetail, isOverride: boolean): string | null {
  if (isOverride) return 'Your number';
  const pct = ratePct(detail.fee_rate_applied);
  return pct ? `B-Stock fee, ${pct} of price` : null;
}

/** Where the shipping number comes from, in a few words (under the Shipping input). */
export function shippingNote(detail: BuyingAuctionDetail, isOverride: boolean): string | null {
  if (isOverride) return 'Your number';
  if (detail.shipping_source === 'quote') {
    const info = detail.shipping_quote_info;
    const trucks = info?.trucks ? `, ${plural(info.trucks, 'truck')}` : '';
    return info?.carrier ? `B-Stock quote (${info.carrier}${trucks})` : 'B-Stock quote';
  }
  const est = detail.shipping_estimate;
  if (est?.basis === 'formula' && est.pallets) {
    const what = est.mode === 'truckload' ? 'truckload' : `${plural(est.pallets, 'pallet')} LTL`;
    return `Estimate, ${what} from ${est.city} (${est.miles?.toLocaleString('en-US')} mi)`;
  }
  if (est?.basis === 'pallets' && est.pallets) {
    const per = formatCurrencyWhole(est.per_pallet ?? '');
    return `Estimate, ${plural(est.pallets, 'pallet')} x ${per} (default rate)`;
  }
  const pct = ratePct(detail.shipping_rate_applied);
  return pct ? `Estimate, ${pct} of price` : null;
}

/** Tooltip on the Shipping label: the quote's details, or the range behind an estimate. */
export function shippingCaption(detail: BuyingAuctionDetail): string {
  if (detail.shipping_source === 'quote') {
    const info = detail.shipping_quote_info;
    const at = detail.shipping_quote_at ? new Date(detail.shipping_quote_at).toLocaleString() : '';
    const to = info?.destination_zip ? ` to ${info.destination_zip}` : '';
    const mode = info?.mode ? ` (${info.mode})` : '';
    return `B-Stock's quote${to}${mode}${at ? `, read ${at}` : ''}. Click to override ($).`;
  }
  const est = detail.shipping_estimate;
  if (est?.basis === 'formula') {
    const range =
      est.low && est.high ? ` Past orders say ${formatCurrencyWhole(est.low)} to ${formatCurrencyWhole(est.high)}.` : '';
    return `From our shipping formula (distance and pallets, fitted on past orders).${range} `
      + 'Open it on B-Stock for its exact quote, or click to override ($).';
  }
  if (est?.basis === 'pallets') {
    const from = est.city ? `how far ${est.city} is` : 'where this lot ships from';
    return `We do not know ${from} yet, so this uses the $ per pallet in Admin > Assumptions. Click to override ($).`;
  }
  return 'Override ($). Default: the B-Stock quote once you open the listing on B-Stock, else pallets x $ per pallet, else rate x price.';
}

/** Small line under an auction's Need: filled in when there is no category mix. */
export function needNote(detail: BuyingAuctionDetail): string | null {
  return detail.valuation_source === 'none' ? 'filled in: no category mix' : null;
}

/** Small line under an auction's Priority: how it was set. */
export function priorityNote(detail: BuyingAuctionDetail): string | null {
  if (detail.priority_basis === 'override') return 'set by hand';
  if (detail.priority_basis === 'need_only') return 'Need only (no profit estimate)';
  if (detail.priority_basis === 'need_profit') {
    const wRaw = Number.parseFloat(detail.priority_profit_weight ?? '0.5');
    let w = Number.isFinite(wRaw) ? wRaw : 0.5;
    const sRaw = Number.parseFloat(detail.priority_speed_weight ?? '0');
    let s = detail.speed_score != null && Number.isFinite(sRaw) ? sRaw : 0;
    if (w + s > 1) {
      const t = w + s;
      w /= t;
      s /= t;
    }
    const profitPct = Math.round(w * 100);
    const speedPct = Math.round(s * 100);
    const score = detail.profit_score != null ? `, profit ${detail.profit_score}` : '';
    if (speedPct > 0) {
      return `Need ${100 - profitPct - speedPct}% + profit ${profitPct}% + speed ${speedPct}%${score}, speed ${detail.speed_score}`;
    }
    return `Need ${100 - profitPct}% + profit ${profitPct}%${score}`;
  }
  return null;
}
