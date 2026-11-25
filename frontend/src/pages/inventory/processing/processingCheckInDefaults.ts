/**
 * Where a check-in's price and retail start (Dash Update #223, Bill 2026-11-24: "Setting manifest row retail or price
 * will change the default on check in for FIRST check in. All subsequent check-ins for that product for that manifest
 * line will use the last check in values").
 *
 * The server applies the same rule when a check-in arrives without a price (`processing_ops.last_check_in_defaults`).
 */
import type { ItemCheckInDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { moneyValuesEqual } from '../../../utils/formInputs';
import { normalizeProductLink } from './processingManifestAccounting';

function stamp(c: ItemCheckInDTO): number {
  const t = c.created_at ? Date.parse(c.created_at) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

/** The newest check-in of this product on this row, or null when the next one is its first. */
export function lastCheckInForProduct(
  checkIns: ItemCheckInDTO[] | undefined,
  productId: number | null | undefined,
): ItemCheckInDTO | null {
  if (productId == null) return null;
  let best: ItemCheckInDTO | null = null;
  for (const c of checkIns ?? []) {
    if (c.product?.id !== productId) continue;
    if (!best || stamp(c) > stamp(best) || (stamp(c) === stamp(best) && c.id > best.id)) best = c;
  }
  return best;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export interface CheckInStart {
  retail: string;
  price: string;
  condition: string;
  dispatch: string;
  /** 'last' = from the last check-in of this product on this row; 'row' = the row's own values. */
  from: 'last' | 'row';
  fromCheckInId: number | null;
}

/** The values a NEW check-in of this product starts from. */
export function checkInStart(
  row: Pick<ProcessingWorkspaceRowDTO, 'itemCheckIns' | 'condition' | 'dispatch'>,
  productId: number | null | undefined,
  rowDefaults: { retail: string; price: string },
): CheckInStart {
  const last = lastCheckInForProduct(row.itemCheckIns, productId);
  const d = last?.defaults ?? {};
  if (last && (str(d.price) || str(d.retail))) {
    const lastDispatch = str(d.dispatch);
    const lastCondition = str(d.condition);
    return {
      retail: str(d.retail) || rowDefaults.retail,
      price: str(d.price) || rowDefaults.price,
      // "unknown" (old check-ins) is not a choice on the form, so it is not carried over.
      condition: lastCondition && lastCondition !== 'unknown' ? lastCondition : row.condition,
      // Restoration needs its own request each time, so a new check-in does not start there.
      dispatch: lastDispatch && lastDispatch !== 'restoration' ? lastDispatch : (row.dispatch || 'on_shelf'),
      from: 'last',
      fromCheckInId: last.id,
    };
  }
  return {
    retail: rowDefaults.retail,
    price: rowDefaults.price,
    condition: row.condition,
    dispatch: row.dispatch || 'on_shelf',
    from: 'row',
    fromCheckInId: null,
  };
}

/**
 * The red line under Retail: this check-in's retail differs from the manifest row's. Only for a plain product on the
 * row; a set, a part or a pack has its own retail by design. Null when there is nothing to say.
 */
export function retailDiffersFromRow(
  row: Pick<ProcessingWorkspaceRowDTO, 'unitRetail' | 'productLinks'>,
  productId: number | null | undefined,
  retail: string,
  opts: { isPack?: boolean } = {},
): { rowRetail: string } | null {
  if (productId == null || opts.isPack) return null;
  const link = normalizeProductLink(row.productLinks?.[String(productId)]);
  if (link.role != null) return null;
  const typed = retail.trim();
  if (!typed || !(Number.parseFloat(typed) > 0)) return null;
  const rowRetail = (row.unitRetail ?? '').trim();
  if (rowRetail && moneyValuesEqual(rowRetail, typed)) return null;
  return { rowRetail };
}
