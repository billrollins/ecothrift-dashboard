import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';

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

export function queueTitleText(row: Pick<ProcessingWorkspaceRowDTO, 'title' | 'product'>): string {
  return row.title || row.product?.title || '—';
}

export function queueBrandText(row: Pick<ProcessingWorkspaceRowDTO, 'brand'>): string {
  return row.brand || '—';
}

export function queueCategoryText(row: Pick<ProcessingWorkspaceRowDTO, 'category'>): string {
  return row.category || '—';
}

export function queueQtyText(row: Pick<ProcessingWorkspaceRowDTO, 'qtyDispositioned' | 'qty'>): string {
  return `${row.qtyDispositioned} / ${row.qty}`;
}

export function queueDispatchLabel(dispatch: string | null | undefined): string {
  return (dispatch || 'on_shelf').replace(/_/g, ' ');
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
