/** Shared order-picker date + label helpers (Processing / Receiving dropdowns). */

/** Same list filter Processing + Receiving floor pickers use. */
export const FLOOR_ORDER_PICKER_PARAMS = {
  status__in: 'paid,shipped,delivered,processing,complete',
  ordering: 'milestones',
  page_size: 100,
} as const;

export type OrderPickerDateFields = {
  delivered_date?: string | null;
  shipped_date?: string | null;
  paid_date?: string | null;
  ordered_date?: string | null;
};

export type OrderPickerBadgeTone = {
  iconBg: string;
  iconColor: string;
  /** Short status hint for title/tooltip */
  label: string;
};

type ReceivingBadgeInput = {
  status?: string | null;
  receiving_status?: string | null;
  shipped_date?: string | null;
};

type ProcessingBadgeInput = {
  status?: string | null;
  processing_status?: string | null;
};

/**
 * Receiving badge colors:
 * - green = receiving done (or PO past delivery)
 * - amber = receiving in progress
 * - blue = shipped / waiting on truck
 * - slate = paid / early pending
 */
export function orderPickerReceivingBadgeColors(order: ReceivingBadgeInput): OrderPickerBadgeTone {
  const recv = String(order.receiving_status ?? '').toLowerCase();
  const status = String(order.status ?? '').toLowerCase();

  if (
    recv === 'done' ||
    status === 'delivered' ||
    status === 'complete' ||
    status === 'processing'
  ) {
    return { iconBg: '#dcfce7', iconColor: '#166534', label: 'Receiving done' };
  }
  if (recv === 'active') {
    return { iconBg: '#ffedd5', iconColor: '#c2410c', label: 'Receiving in progress' };
  }
  if (status === 'shipped' || Boolean(String(order.shipped_date ?? '').trim())) {
    return { iconBg: '#dbeafe', iconColor: '#1d4ed8', label: 'Shipped - waiting' };
  }
  return { iconBg: '#f1f5f9', iconColor: '#475569', label: 'Pending shipment' };
}

/**
 * Processing badge colors:
 * - green = floor work done / PO complete
 * - teal = actively processing
 * - sky = delivered / ready on floor
 * - blue = shipped (inbound)
 * - amber = paid / awaiting arrival
 */
export function orderPickerProcessingBadgeColors(order: ProcessingBadgeInput): OrderPickerBadgeTone {
  const proc = String(order.processing_status ?? '').toLowerCase();
  const status = String(order.status ?? '').toLowerCase();

  if (proc === 'done' || status === 'complete') {
    return { iconBg: '#dcfce7', iconColor: '#166534', label: 'Processing done' };
  }
  if (proc === 'active' || status === 'processing') {
    return { iconBg: '#ccfbf1', iconColor: '#0f766e', label: 'Processing active' };
  }
  if (status === 'delivered') {
    return { iconBg: '#e0f2fe', iconColor: '#0369a1', label: 'Delivered - ready' };
  }
  if (status === 'shipped') {
    return { iconBg: '#dbeafe', iconColor: '#1d4ed8', label: 'Shipped' };
  }
  return { iconBg: '#fef3c7', iconColor: '#b45309', label: 'Paid - awaiting' };
}

export type RelevantOrderDate = {
  /** Short chip label, e.g. DEL */
  shortLabel: string;
  /** Full word, e.g. Delivered */
  label: string;
  /** ISO date YYYY-MM-DD */
  value: string;
};

const MILESTONES: Array<{
  key: keyof OrderPickerDateFields;
  shortLabel: string;
  label: string;
}> = [
  { key: 'delivered_date', shortLabel: 'DEL', label: 'Delivered' },
  { key: 'shipped_date', shortLabel: 'SHIP', label: 'Shipped' },
  { key: 'paid_date', shortLabel: 'PAID', label: 'Paid' },
  { key: 'ordered_date', shortLabel: 'ORD', label: 'Ordered' },
];

/** Most recent (most advanced) milestone with a date. */
export function pickMostRelevantOrderDate(
  order: OrderPickerDateFields,
): RelevantOrderDate | null {
  for (const m of MILESTONES) {
    const value = (order[m.key] || '').trim();
    if (value) {
      return { shortLabel: m.shortLabel, label: m.label, value };
    }
  }
  return null;
}

/** Compact display: `DEL · Nov 22, 2026` */
export function formatRelevantOrderDateLine(
  order: OrderPickerDateFields,
  fallback = '-',
): string {
  const hit = pickMostRelevantOrderDate(order);
  if (!hit) return fallback;
  return `${hit.shortLabel} · ${formatOrderPickerDate(hit.value)}`;
}

export function formatOrderPickerDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function orderPickerVendorGlyph(vendorCode?: string | null): string {
  const code = String(vendorCode ?? '').trim().toUpperCase();
  return code.slice(0, 2) || '?';
}
