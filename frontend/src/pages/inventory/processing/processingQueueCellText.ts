import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';

import { processingDispatchLabel } from './processingItemFormOptions';
import { processingTokens } from './processingTokens';

export function queueStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    partial: 'Partial',
    checked_in: 'Checked In',
    disputed: 'Disputed',
  };
  return map[status] ?? status;
}

export function queueStatusMeta(status: string) {
  const label = queueStatusLabel(status);
  const colors: Record<string, { color: string; bg: string; border?: string }> = {
    pending: {
      color: processingTokens.textSoft,
      bg: processingTokens.neutralSoft,
      border: processingTokens.border,
    },
    partial: {
      color: processingTokens.accentAmber,
      bg: processingTokens.amberSoft,
      border: 'rgba(146, 64, 14, 0.2)',
    },
    checked_in: {
      color: processingTokens.accentGreen,
      bg: processingTokens.greenSoft,
      border: 'rgba(22, 101, 52, 0.2)',
    },
    disputed: {
      color: processingTokens.accentRed,
      bg: processingTokens.redSoft,
      border: 'rgba(153, 27, 27, 0.2)',
    },
  };
  const c = colors[status] ?? {
    color: processingTokens.textSoft,
    bg: processingTokens.neutralSoft,
    border: processingTokens.border,
  };
  return { label, ...c };
}

export function formatQueueMoney(v: string | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return v;
  return formatCurrency(n);
}

export function queueExtRetailValue(
  row: Pick<ProcessingWorkspaceRowDTO, 'unitRetail' | 'qty'>,
): number | null {
  if (row.unitRetail == null || row.unitRetail === '') return null;
  const retail = Number.parseFloat(row.unitRetail);
  if (Number.isNaN(retail)) return null;
  return retail * Math.max(0, row.qty ?? 0);
}

export function queueExtRetailText(
  row: Pick<ProcessingWorkspaceRowDTO, 'unitRetail' | 'qty'>,
): string {
  const total = queueExtRetailValue(row);
  if (total == null) return '—';
  return formatCurrency(total);
}

/** Bookmark-only identity text for queue columns (never product-coalesced). */
function queueRowDetailField(
  row: Partial<Pick<ProcessingWorkspaceRowDTO, 'title' | 'brand' | 'category' | 'standardizedIdentity'>>,
  field: 'title' | 'brand' | 'category',
): string {
  const fromStd = row.standardizedIdentity?.[field]?.trim();
  if (fromStd) return fromStd;
  const fromRow = row[field];
  if (typeof fromRow === 'string' && fromRow.trim()) return fromRow.trim();
  return '';
}

/** Hint when an attached catalog product overrides the row bookmark in other views. */
export function queueAttachedProductHint(
  row: Pick<ProcessingWorkspaceRowDTO, 'product'> &
    Partial<Pick<ProcessingWorkspaceRowDTO, 'title' | 'brand' | 'standardizedIdentity'>>,
  field: 'title' | 'brand',
): string {
  const bookmark = queueRowDetailField(row, field);
  const productVal = row.product?.[field]?.trim() ?? '';
  if (!productVal || productVal === bookmark) return '';
  return `Product ${field}: ${productVal}`;
}

export function queueTitleText(
  row: Pick<ProcessingWorkspaceRowDTO, 'title' | 'standardizedIdentity'> &
    Partial<Pick<ProcessingWorkspaceRowDTO, 'collapsedGroup' | 'collapseMasterId' | 'splitParentRowNumber'>>,
): string {
  const base = queueRowDetailField(row, 'title') || '—';
  if (row.collapsedGroup) {
    return `⊟ ${base} (+rows ${row.collapsedGroup.memberRowNumbers.join(', ')})`;
  }
  if (row.collapseMasterId) {
    return `↳ ${base}`;
  }
  if (row.splitParentRowNumber != null) {
    return `↳ ${base} (from #${row.splitParentRowNumber})`;
  }
  return base;
}

/** P9 split sub rows display as `12.1`; everything else keeps its plain row number. */
export function queueRowNumLabel(
  row: Pick<ProcessingWorkspaceRowDTO, 'rowNum'> &
    Partial<Pick<ProcessingWorkspaceRowDTO, 'splitParentRowNumber' | 'splitSeq'>>,
): string {
  if (row.splitParentRowNumber != null && row.splitSeq != null) {
    return `${row.splitParentRowNumber}.${row.splitSeq}`;
  }
  return String(row.rowNum);
}

export function queueBrandText(
  row: Pick<ProcessingWorkspaceRowDTO, 'brand' | 'standardizedIdentity'>,
): string {
  return queueRowDetailField(row, 'brand') || '—';
}

/** Bookmark-only row fields for the row-details editor (never product-coalesced). */
export function processingRowBookmark(
  row: Pick<
    ProcessingWorkspaceRowDTO,
    'standardizedIdentity' | 'category' | 'identifiers'
  >,
) {
  const std = row.standardizedIdentity;
  return {
    title: std?.title ?? '',
    brand: std?.brand ?? '',
    model: std?.model ?? '',
    category: std?.category ?? '',
    identifiers: std?.identifiers ?? row.identifiers ?? {},
  };
}

/** Hover text when display may differ from bookmark standardized fields (product-wins coalesce). */
export function processingIdentityHoverTooltip(
  displayed: string,
  standardized: string | undefined,
  fieldLabel: string,
): string {
  const disp = displayed.trim() || '—';
  const std = standardized?.trim() ?? '';
  if (!std) {
    return disp === '—' ? '' : disp;
  }
  if (!disp || disp === '—' || std === disp) {
    return `Standardized ${fieldLabel}: ${std}`;
  }
  return `Showing: ${disp}\nStandardized ${fieldLabel}: ${std}`;
}

export function queueCategoryText(
  row: Pick<ProcessingWorkspaceRowDTO, 'category' | 'standardizedIdentity'>,
): string {
  return queueRowDetailField(row, 'category') || '—';
}

export function queueQtyText(
  row: Pick<ProcessingWorkspaceRowDTO, 'qtyDispositioned' | 'qty'> & Partial<Pick<ProcessingWorkspaceRowDTO, 'collapsedGroup'>>,
): string {
  // Masters show the COMBINED group quantities (collapsed rows act as one row).
  if (row.collapsedGroup) {
    return `${row.collapsedGroup.totalDispositioned.toLocaleString()} / ${row.collapsedGroup.totalQty.toLocaleString()}`;
  }
  return `${row.qtyDispositioned.toLocaleString()} / ${row.qty.toLocaleString()}`;
}

export interface EffectiveRowQty {
  qty: number;
  dispositioned: number;
  remaining: number;
  overage: number;
  /** True when the numbers are COMBINED collapse-group totals (row is a master). */
  isGroup: boolean;
}

/**
 * P7 collapse: every qty display/cap for a master row must use the COMBINED group
 * numbers (Expected, Left, check-in caps), never the master's own row. One helper so
 * the queue, row detail, quick check-in, and the detailed dialog can't disagree.
 */
export function effectiveRowQty(
  row: Pick<ProcessingWorkspaceRowDTO, 'qty' | 'qtyDispositioned'> &
    Partial<Pick<ProcessingWorkspaceRowDTO, 'qtyRemaining' | 'qtyOverage' | 'collapsedGroup'>>,
): EffectiveRowQty {
  if (row.collapsedGroup) {
    const qty = row.collapsedGroup.totalQty;
    const dispositioned = row.collapsedGroup.totalDispositioned;
    return {
      qty,
      dispositioned,
      remaining: Math.max(0, qty - dispositioned),
      overage: Math.max(0, dispositioned - qty),
      isGroup: true,
    };
  }
  const qty = row.qty ?? 0;
  const dispositioned = row.qtyDispositioned ?? 0;
  return {
    qty,
    dispositioned,
    remaining: row.qtyRemaining ?? Math.max(0, qty - dispositioned),
    overage: row.qtyOverage ?? Math.max(0, dispositioned - qty),
    isGroup: false,
  };
}

export function queueProductsChipLabel(count: number | null | undefined): string | null {
  if (count == null || count < 2) return null;
  return count === 2 ? '2 products' : `${count} products`;
}

export function queueSameProductPeerLabel(peerRowNumbers: number[] | null | undefined): string | null {
  if (!peerRowNumbers?.length) return null;
  return `also ${peerRowNumbers.join(', ')}`;
}

export function queueDispatchLabel(dispatch: string | null | undefined): string {
  return processingDispatchLabel(dispatch);
}

export function itemStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function itemStatusMeta(item: Pick<ProcessingWorkspaceItemDTO, 'status' | 'dispute_type' | 'dispute_pct_loss'>) {
  if (item.dispute_type || item.dispute_pct_loss != null) {
    return {
      label: item.dispute_pct_loss != null ? `Disputed ${item.dispute_pct_loss}%` : 'Disputed',
      color: processingTokens.accentRed,
      bg: processingTokens.redSoft,
      border: 'rgba(153, 27, 27, 0.2)',
    };
  }
  const label = itemStatusLabel(item.status);
  const colors: Record<string, { color: string; bg: string; border?: string }> = {
    on_shelf: {
      color: processingTokens.accentGreen,
      bg: processingTokens.greenSoft,
      border: 'rgba(22, 101, 52, 0.2)',
    },
    sold: {
      color: processingTokens.accentBlue,
      bg: processingTokens.blueSoft,
      border: processingTokens.border,
    },
    scrapped: {
      color: processingTokens.accentRed,
      bg: processingTokens.redSoft,
      border: 'rgba(153, 27, 27, 0.2)',
    },
    lost: {
      color: processingTokens.accentAmber,
      bg: processingTokens.amberSoft,
      border: 'rgba(146, 64, 14, 0.2)',
    },
    returned: {
      color: processingTokens.textSoft,
      bg: processingTokens.neutralSoft,
      border: processingTokens.border,
    },
  };
  const c = colors[item.status] ?? {
    color: processingTokens.textSoft,
    bg: processingTokens.neutralSoft,
    border: processingTokens.border,
  };
  return { label, ...c };
}
