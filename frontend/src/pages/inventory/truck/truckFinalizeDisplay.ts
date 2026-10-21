import type { TruckFinalizeDTO } from '../../../api/truckFinalize.api';

/** Things worth knowing before a truck is marked finalized (none of them blocks it). */
export function finalizeWarnings(data: TruckFinalizeDTO): string[] {
  const out: string[] = [];
  if (!data.order.has_manifest) out.push('This order has no manifest, so nothing can be compared.');
  if (data.pending_units > 0) out.push(`${data.pending_units} units are still in intake or processing.`);
  const { total, done } = data.pallets;
  if (total > 0 && done < total) out.push(`${total - done} of ${total} pallets are not marked done in Processing.`);
  if (data.order.purchase_cost == null) out.push('The sale price is not on the order, so the refund is unknown.');
  if (data.totals.lines_without_retail > 0) {
    out.push(`${data.totals.lines_without_retail} manifest lines have no retail; they count in units only.`);
  }
  return out;
}

export function pctText(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}

export function unitsText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return Number.isInteger(n) ? new Intl.NumberFormat().format(n) : n.toFixed(1);
}

/** The refund rule in words, with the owner's settings. */
export function refundRuleText(rate: number, deductible: number): string {
  const r = Math.round(rate * 1000) / 10;
  const d = Math.round(deductible * 1000) / 10;
  return `Sellers refund ${r}% of the sale price (no fees, no shipping) for missing and broken goods, after the first ${d}% of the manifest retail, which is never refunded.`;
}
