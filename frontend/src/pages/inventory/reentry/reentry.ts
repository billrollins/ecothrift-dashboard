/**
 * Items back in Processing: the words and small rules shared by the Returns and Floor issues pages (Dash Updates
 * #83 and #84). A page passes its `source`; everything that differs between the two pages is in `SOURCE_WORDS`.
 */
import { format, parseISO } from 'date-fns';
import type { ReentryDone, ReentryRow, ReentrySource } from '../../../api/reentry.api';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';

export const SOURCE_WORDS: Record<ReentrySource, { page: string; empty: string; emptyDone: string }> = {
  return: {
    page: 'Returns',
    empty: 'No returns are waiting.',
    emptyDone: 'No returns have been handled yet.',
  },
  floor: {
    page: 'Floor issues',
    empty: 'No floor issues are waiting.',
    emptyDone: 'No floor issues have been handled yet.',
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

/** "Tue Nov 10, 3:05 PM": the day and the time of day, so two rows of one day can be told apart. */
export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d, h:mm a');
  } catch {
    return '';
  }
}

/**
 * How it got on the list, and who put it there: "Returned Tue Nov 10, 3:05 PM · return taken by Sam" (a return at
 * the register: the name is the cashier, not the customer), "Added to Returns ... by Sam" (added by hand on the
 * page), "Reported ... by Sam" (a floor issue).
 */
export function cameBackLine(row: ReentryRow): string {
  const when = dayTime(row.reported_at);
  if (row.source === 'floor') return [`Reported ${when}`.trim(), row.reported_by ? `by ${row.reported_by}` : ''].filter(Boolean).join(' ');
  if (!row.sale) return [`Added to Returns ${when}`.trim(), row.reported_by ? `by ${row.reported_by}` : ''].filter(Boolean).join(' ');
  return [`Returned ${when}`.trim(), row.reported_by ? `return taken by ${row.reported_by}` : ''].filter(Boolean).join(' · ');
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

/** Where the item goes now, said right after an action (the fourth step, in the page's own words). */
export function nextStepLine(done: ReentryDone): string {
  switch (done.row.outcome) {
    case 'repriced':
      return 'Put the new tag on it and take it back out to the sales floor.';
    case 'shelf':
      return 'Take it back out to the sales floor. It keeps its tag.';
    case 'restoration':
      return done.item.restoration_tag
        ? 'Put the restoration tag on it and take it to the Restoration shelf.'
        : 'Take it to the Restoration shelf.';
    case 'scrapped':
      return 'It is out of stock now. Put it in the scrap bin.';
    default:
      return '';
  }
}

/** What each of the four buttons is for, and where the item goes after (the steps box). */
export const BUTTON_HELP: { name: string; text: string }[] = [
  { name: 'Price again', text: 'It can sell, at a new price. A new tag prints. Back to the sales floor.' },
  { name: 'Back to shelf as is', text: 'Nothing is wrong with it. Same price, same tag. Back to the sales floor.' },
  { name: 'Send to Restoration', text: 'It needs cleaning, a fix or a test first. A restoration tag prints.' },
  { name: 'Scrap', text: 'It cannot be sold. It comes out of stock. Into the scrap bin.' },
];

/** How long Back to shelf as is and Scrap wait before they save, so a slip can be undone. */
export const UNDO_SECONDS = 5;

/** The quick scrap reason the report or return already gives ("Broken or damaged: cracked" is Broken), or ''. */
export function scrapReasonFrom(why: string): string {
  const text = why.toLowerCase();
  if (/broken|damaged|crack|shatter/.test(text)) return 'Broken';
  if (/missing part|missing piece|parts? missing/.test(text)) return 'Missing parts';
  if (/dirty|stain/.test(text)) return 'Dirty or stained';
  if (/not safe|unsafe|recall/.test(text)) return 'Not safe to sell';
  return '';
}

/** What Restoration should do, from why it came back ("Dirty" is Clean, "Does not work" is Test), or none. */
export function restorationNeedsFrom(why: string): ('test' | 'clean' | 'repair' | 'check_parts')[] {
  const text = why.toLowerCase();
  const needs: ('test' | 'clean' | 'repair' | 'check_parts')[] = [];
  if (/dirty|stain|smell/.test(text)) needs.push('clean');
  if (/broken|damaged|crack/.test(text)) needs.push('repair');
  if (/does not work|doesn.t work|not working|does not turn on|won.t turn on|dead/.test(text)) needs.push('test');
  if (/missing part|missing piece|parts? missing/.test(text)) needs.push('check_parts');
  return needs;
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

/** The price the floor said it should be ("Price too high: should be $12.00; ..."), or null. */
export function suggestedPrice(row: ReentryRow): string | null {
  const hit = /(?:^|[:;]\s*)should be \$(\d+(?:\.\d{1,2})?)/i.exec(row.reason ?? '');
  return hit ? typedPrice(hit[1]) : null;
}

/** What a price box keeps of what was typed or scanned into it: digits and one dot, two decimals. */
export function priceInput(raw: string): string {
  const clean = raw.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = clean.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

/** A new price far above anything this item has carried (a slip of the hand, or a scan that landed in the box). */
export function looksTooHigh(price: string | null, item: ReentryRow['item']): boolean {
  if (!price) return false;
  const known = Math.max(Number(item.price) || 0, Number(item.retail) || 0);
  return Number(price) > Math.max(known * 3, 100);
}

/** Words that are really a scanned tag (an item number, or our tag link), which is never a reason. */
export function looksLikeItemNumber(text: string): boolean {
  const value = text.trim();
  return /^itm\d{4,}$/i.test(skuFromScan(value)) || /ecothrift\.us\/i\//i.test(value);
}

/** A new price someone typed, as the API wants it ("59.99"), or null when it is not a price above $0. */
export function typedPrice(raw: string): string | null {
  const text = raw.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n.toFixed(2) : null;
}
