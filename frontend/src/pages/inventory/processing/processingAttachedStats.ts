/**
 * The counts on the attached products of a manifest row (Dash Update #229, Bill 2026-11-25: "top of attached product
 * (left) # products, Total Number checked in; per check in line. # checked in etc").
 */
import { formatCurrency } from '../../../utils/format';
import {
  formatManifestUnits,
  productLinkUsesManifestAccounting,
  type ProcessingProductLinkConfig,
} from './processingManifestAccounting';

export interface AttachedCountSource {
  checkedInQty: number;
  linkConfig: ProcessingProductLinkConfig;
}

/**
 * What one attached product's line says about its check-ins on this row: "3 checked in · last $4.99", with the row
 * units for a set or a part, or "none yet".
 */
export function attachedStatusLine(product: AttachedCountSource, lastPrice?: string | null): string {
  const n = product.checkedInQty;
  if (!n) return 'none yet';
  const units = (n * product.linkConfig.manifestUnits) / product.linkConfig.checkIns;
  const rowUnits =
    productLinkUsesManifestAccounting(product.linkConfig) ?
      ` (${formatManifestUnits(units)} row${Math.abs(units - 1) < 0.05 ? '' : 's'})`
    : '';
  const price = lastPrice && Number.parseFloat(lastPrice) > 0 ? ` · last ${formatCurrency(lastPrice)}` : '';
  return `${n.toLocaleString()} checked in${rowUnits}${price}`;
}

/** "2 products · 5 checked in": the counts on top of the attached products. */
export function attachedTotals(products: Pick<AttachedCountSource, 'checkedInQty'>[]): { products: number; checkedIn: number } {
  return { products: products.length, checkedIn: products.reduce((sum, p) => sum + (p.checkedInQty || 0), 0) };
}
