import type { PreprocessingReviewRow, PreprocessingReviewRowPatch } from '../api/inventory.api';

function qtyEff(quantity: number | undefined): number {
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Mirrors preprocessing_summary price_coalesced: final_price else proposed_price (with draft overlay). */
export function effectiveReviewSetPrice(
  row: PreprocessingReviewRow,
  draft?: PreprocessingReviewRowPatch,
): number | null {
  if (draft && 'final_price' in draft && draft.final_price !== undefined) {
    const parsed = parseMoney(String(draft.final_price));
    if (parsed !== null) return parsed;
  } else {
    const parsed = parseMoney(row.final_price);
    if (parsed !== null) return parsed;
  }
  if (draft && 'proposed_price' in draft && draft.proposed_price !== undefined) {
    const parsed = parseMoney(String(draft.proposed_price));
    if (parsed !== null) return parsed;
  }
  return parseMoney(row.proposed_price);
}

/** Match summarize_preprocessing_rows_aggregate line totals for staging rows (ideal from row.ideal_price × qty). */
export function computeReviewPricingTotals(
  rows: PreprocessingReviewRow[],
  draftsById: Record<number, PreprocessingReviewRowPatch>,
): { totalSet: number; deltaPct: number | null } {
  let totalSet = 0;
  let totalIdeal = 0;
  for (const row of rows) {
    const q = qtyEff(row.quantity);
    const unitIdeal = parseMoney(row.ideal_price);
    if (unitIdeal !== null) totalIdeal += unitIdeal * q;
    const linePrice = effectiveReviewSetPrice(row, draftsById[row.id]);
    if (linePrice !== null) totalSet += linePrice * q;
  }
  const deltaPct =
    totalIdeal > 0 ? Math.round(((totalSet - totalIdeal) / totalIdeal) * 1000) / 10 : null;
  return { totalSet, deltaPct };
}

export function roundReviewPrice(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Scale from AI proposed_price base; null = skip row (never write 0). */
export function scaleFromAiBase(proposedPrice: string | null | undefined, factor: number): string | null {
  const base = parseMoney(proposedPrice);
  if (base === null || base <= 0 || !Number.isFinite(factor) || factor <= 0) return null;
  return roundReviewPrice(base * factor);
}

/** Price as pct of unit retail; null = skip row. */
export function priceFromRetail(unitRetail: string | null | undefined, pct: number): string | null {
  const retail = parseMoney(unitRetail);
  if (retail === null || retail <= 0 || !Number.isFinite(pct) || pct <= 0) return null;
  return roundReviewPrice(retail * (pct / 100));
}

/** Sum of proposed_price × qty for rows with an AI base. */
export function aiBaseOrderTotal(rows: PreprocessingReviewRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const base = parseMoney(row.proposed_price);
    if (base === null) continue;
    sum += base * qtyEff(row.quantity);
  }
  return sum;
}

/** Uniform factor to hit a target order total from AI bases. */
export function factorForTargetTotal(rows: PreprocessingReviewRow[], targetTotal: number): number | null {
  if (!Number.isFinite(targetTotal) || targetTotal <= 0) return null;
  const sum = aiBaseOrderTotal(rows);
  if (sum <= 0) return null;
  return targetTotal / sum;
}

/**
 * Scale every row's CURRENT effective price so the order total lands exactly on target.
 *
 * Per-row prices floor to cents, then the leftover cents distribute to the rows closest
 * to rounding up (smallest qty first - a 1¢ bump on a row adds `qty` cents to the total).
 * With any qty-1 rows the achieved total is exact; worst case it lands within
 * (smallest qty − 1) cents under target. Rows with no current price are skipped.
 */
export function exactTargetPrices(
  rows: PreprocessingReviewRow[],
  draftsById: Record<number, PreprocessingReviewRowPatch>,
  targetTotal: number,
): { prices: Record<number, string>; achieved: number; priced: number; skipped: number } | null {
  if (!Number.isFinite(targetTotal) || targetTotal <= 0) return null;

  const items: { id: number; qty: number; cents: number; rem: number }[] = [];
  let skipped = 0;
  let current = 0;
  for (const row of rows) {
    const unit = effectiveReviewSetPrice(row, draftsById[row.id]);
    const qty = qtyEff(row.quantity);
    if (unit === null || unit <= 0) {
      skipped += 1;
      continue;
    }
    items.push({ id: row.id, qty, cents: 0, rem: unit * qty });
    current += unit * qty;
  }
  if (!items.length || current <= 0) return null;

  const factor = targetTotal / current;
  const targetCents = Math.round(targetTotal * 100);
  for (const it of items) {
    const rawUnitCents = (it.rem / it.qty) * factor * 100;
    it.cents = Math.floor(rawUnitCents + 1e-9);
    it.rem = rawUnitCents - it.cents;
  }

  let residual = targetCents - items.reduce((s, it) => s + it.cents * it.qty, 0);
  for (let pass = 0; pass < 50 && residual > 0; pass += 1) {
    const order = [...items].sort((a, b) => b.rem - a.rem || a.qty - b.qty);
    let moved = false;
    for (const it of order) {
      if (residual <= 0) break;
      if (it.qty <= residual) {
        it.cents += 1;
        it.rem = Math.max(0, it.rem - 1);
        residual -= it.qty;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const prices: Record<number, string> = {};
  for (const it of items) prices[it.id] = (it.cents / 100).toFixed(2);
  const achieved = items.reduce((s, it) => s + it.cents * it.qty, 0) / 100;
  return { prices, achieved, priced: items.length, skipped };
}
