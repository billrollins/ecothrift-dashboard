/**
 * Shared formatting utilities for currency and numbers.
 *
 * formatCurrencyWhole  — for summaries/lists: $58,822 (no decimals)
 * formatCurrency       — for pricing tables:  $58,822.00 (two decimals)
 * formatNumber         — for item counts:     1,149
 */

const wholeFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** List/summary view currency: $58,822 */
export function formatCurrencyWhole(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isNaN(n) ? '—' : wholeFormatter.format(n);
}

/** Pricing table currency: $58,822.00 */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isNaN(n) ? '—' : decimalFormatter.format(n);
}

/** Integer/count with comma separator: 1,149 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}
