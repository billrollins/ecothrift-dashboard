/** Shared order-picker date + label helpers (Processing / Receiving dropdowns). */

export type OrderPickerDateFields = {
  delivered_date?: string | null;
  shipped_date?: string | null;
  paid_date?: string | null;
  ordered_date?: string | null;
};

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
  fallback = '—',
): string {
  const hit = pickMostRelevantOrderDate(order);
  if (!hit) return fallback;
  return `${hit.shortLabel} · ${formatOrderPickerDate(hit.value)}`;
}

export function formatOrderPickerDate(value: string | null | undefined): string {
  if (!value) return '—';
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
