/**
 * Items back in Processing: the words and small rules shared by the Returns and Floor issues pages (Dash Updates
 * #83 and #84). A page passes its `source`; everything that differs between the two pages is in `SOURCE_WORDS`.
 */
import { format, parseISO } from 'date-fns';
import type { ReentryDone, ReentryRow, ReentrySource } from '../../../api/reentry.api';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';

export const SOURCE_WORDS: Record<ReentrySource, { page: string; empty: string; emptyDone: string; cameBack: string }> = {
  return: {
    page: 'Returns',
    empty: 'No returns are waiting.',
    emptyDone: 'No returns have been handled yet.',
    cameBack: 'Returned',
  },
  floor: {
    page: 'Floor issues',
    empty: 'No floor issues are waiting.',
    emptyDone: 'No floor issues have been handled yet.',
    cameBack: 'Reported',
  },
};

/** One-tap scrap reasons; the box takes any other words. */
export const SCRAP_REASONS = ['Broken', 'Missing parts', 'Not safe to sell', 'Dirty or stained'];

export function day(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d');
  } catch {
    return '';
  }
}

/** "Returned Tue Nov 10 by Sam" / "Reported Tue Nov 10 by Sam". */
export function cameBackLine(row: ReentryRow): string {
  const parts = [SOURCE_WORDS[row.source].cameBack, day(row.reported_at)].filter(Boolean).join(' ');
  return row.reported_by ? `${parts} by ${row.reported_by}` : parts;
}

/** "Sold for $80.00 on Mon Nov 9" for a register return; '' otherwise. */
export function soldLine(row: ReentryRow): string {
  if (!row.sale) return '';
  const price = row.sale.sold_price ? `Sold for ${formatCurrency(row.sale.sold_price)}` : 'Sold';
  const on = day(row.sale.sold_at);
  return on ? `${price} on ${on}` : price;
}

/** What was done, for the Done list and the line shown right after an action. */
export function outcomeLine(row: ReentryRow): string {
  switch (row.outcome) {
    case 'repriced':
      return row.old_price && row.new_price && row.old_price !== row.new_price
        ? `Priced again: ${formatCurrency(row.old_price)} to ${formatCurrency(row.new_price)}`
        : `Priced again at ${formatCurrency(row.new_price ?? row.item.price)}`;
    case 'shelf':
      return 'Back to shelf as is';
    case 'restoration':
      return 'Sent to Restoration';
    case 'scrapped':
      return row.outcome_note ? `Scrapped: ${row.outcome_note}` : 'Scrapped';
    case 'handled':
      return row.outcome_note || 'Handled another way';
    default:
      return '';
  }
}

/** Whether an action's answer has a tag to print (a price tag after Price again, a restoration tag after a send). */
export function hasTagToPrint(done: ReentryDone): boolean {
  return done.row.outcome === 'repriced' || (done.row.outcome === 'restoration' && done.item.restoration_tag != null);
}

/** The rows a scan or typed words leave on the list: an exact item number first, else words in the title or brand. */
export function filterRows(rows: ReentryRow[], typed: string): ReentryRow[] {
  const text = skuFromScan(typed).trim().toLowerCase();
  if (!text) return rows;
  const exact = rows.filter((r) => r.item.sku.toLowerCase() === text);
  if (exact.length) return exact;
  return rows.filter((r) =>
    [r.item.sku, r.item.product_title, r.item.product_brand, r.reason].some((v) => (v ?? '').toLowerCase().includes(text)));
}

/** A new price someone typed, as the API wants it ("59.99"), or null when it is not a price above $0. */
export function typedPrice(raw: string): string | null {
  const text = raw.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n.toFixed(2) : null;
}
