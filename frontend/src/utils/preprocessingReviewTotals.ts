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
