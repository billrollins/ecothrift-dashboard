import type { ManualReviewSummary, PreprocessingReviewRow } from '../../../api/inventory.api';

function parseMoney(value: string | null | undefined): number | null {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

/** Summary over arbitrary subset (client-filtered review rows). */
export function summarizePreprocessingReviewRows(
  totalPaid: string,
  rows: PreprocessingReviewRow[],
): ManualReviewSummary {
  let total_ideal = 0;
  let total_set = 0;
  let total_units = 0;
  let missing_price = 0;
  let low_confidence = 0;

  for (const row of rows) {
    const qty = row.quantity && row.quantity > 0 ? row.quantity : 1;
    total_units += qty;
    const ideal = parseMoney(row.ideal_price);
    if (ideal != null) total_ideal += ideal * qty;

    const fp = parseMoney(row.final_price);
    const pp = parseMoney(row.proposed_price);
    const effective = fp ?? pp;
    if (effective == null || effective <= 0) missing_price += 1;
    else total_set += effective * qty;

    if ((row.notes || '').toLowerCase().includes('low confidence')) low_confidence += 1;
  }

  let ideal_delta_pct: number | null = null;
  if (total_ideal > 0) {
    ideal_delta_pct = Math.round(((total_set - total_ideal) / total_ideal) * 1000) / 10;
  }

  return {
    total_paid: totalPaid,
    total_ideal_price: total_ideal.toFixed(2),
    total_set_prices: total_set.toFixed(2),
    ideal_delta_pct,
    total_rows: rows.length,
    total_units,
    missing_price,
    low_confidence,
  };
}
