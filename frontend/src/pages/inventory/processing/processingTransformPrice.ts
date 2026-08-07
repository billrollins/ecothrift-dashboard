import { formatCurrency } from '../../../utils/format';

export type ProcessingTransformMode = 'break_apart' | 'make_set';

export function parseRowShelfPrice(price: string | null | undefined): number | null {
  const raw = price?.trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Default shelf/tag price for the transformed row (per subitem or per set). */
export function defaultTransformShelfPrice(
  mode: ProcessingTransformMode,
  rowPrice: number | null,
  factor: number | null,
  setSize: number | null,
): string {
  if (rowPrice == null) return '';
  if (mode === 'break_apart') {
    if (!factor || factor < 2) return '';
    return (rowPrice / factor).toFixed(2);
  }
  if (!setSize || setSize < 2) return '';
  return (rowPrice * setSize).toFixed(2);
}

export function transformPriceHelperText(
  mode: ProcessingTransformMode,
  rowPrice: number | null,
  factor: number | null,
  setSize: number | null,
): string {
  if (rowPrice == null) {
    return 'Set a row price first, or enter a price here.';
  }
  if (mode === 'break_apart') {
    if (!factor || factor < 2) {
      return 'Enter subitems per unit to calculate price per subitem from the row price.';
    }
    const each = rowPrice / factor;
    return `${formatCurrency(rowPrice)} ÷ ${factor.toLocaleString()} subitems = ${formatCurrency(each)} per subitem - edit or submit as-is.`;
  }
  if (!setSize || setSize < 2) {
    return 'Enter set size to calculate price per set from the row price.';
  }
  const perSet = rowPrice * setSize;
  return `${formatCurrency(rowPrice)} × ${setSize.toLocaleString()} units/set = ${formatCurrency(perSet)} per set - edit or submit as-is.`;
}
