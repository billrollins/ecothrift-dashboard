import { format, parseISO } from 'date-fns';
import type { BadTag, BadTagListParams, BadTagReason, BadTagTrace } from '../../../api/badTags.api';
import { BAD_TAG_REASONS } from '../../../api/badTags.api';

/** Tag errors page (retail_tags_and_social Phase 1): URL state and display helpers. */

export const TAG_ERRORS_PATH = '/inventory/tag-errors';

export type TagErrorsShow = 'all' | 'open' | 'fixed';

export interface TagErrorFilters {
  /** ISO week, e.g. 2026-W43. */
  week: string;
  reason: BadTagReason | '';
  show: TagErrorsShow;
  /** Managers only: who checked the items in. */
  processor: number | null;
  /** Managers only: the truck (purchase order). */
  po: number | null;
}

const WEEK = /^\d{4}-W\d{2}$/;
const REASON_KEYS = new Set<string>(BAD_TAG_REASONS.map((r) => r.key));

function positiveInt(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Filters from the query string; anything unreadable falls back to this week, every reason, all. */
export function readTagErrorFilters(params: URLSearchParams, thisWeek: string): TagErrorFilters {
  const week = params.get('week') || '';
  const reason = params.get('reason') || '';
  const show = params.get('show') || '';
  return {
    week: WEEK.test(week) ? week : thisWeek,
    reason: REASON_KEYS.has(reason) ? (reason as BadTagReason) : '',
    show: show === 'open' || show === 'fixed' ? show : 'all',
    processor: positiveInt(params.get('processor')),
    po: positiveInt(params.get('po')),
  };
}

/** The list API's params (empty filters left out). */
export function tagErrorListParams(f: TagErrorFilters): BadTagListParams {
  return {
    week: f.week,
    ...(f.reason ? { reason: f.reason } : {}),
    ...(f.show !== 'all' ? { show: f.show } : {}),
    ...(f.processor ? { processor: f.processor } : {}),
    ...(f.po ? { po: f.po } : {}),
  };
}

/** A link into the page, e.g. from Retail QA's Tag errors panel. */
export function tagErrorsLink(opts: { week: string; processor?: number | null; po?: number | null }): string {
  const search = new URLSearchParams({ week: opts.week });
  if (opts.processor) search.set('processor', String(opts.processor));
  if (opts.po) search.set('po', String(opts.po));
  return `${TAG_ERRORS_PATH}?${search.toString()}`;
}

export function money(v: string | null | undefined): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '-';
}

/** What the tag said: "$14.00 · retail $70.00", or just the price. */
export function tagSaid(row: Pick<BadTag, 'tag_price' | 'tag_retail'>): string {
  if (row.tag_price == null && row.tag_retail == null) return '-';
  const price = money(row.tag_price);
  return row.tag_retail != null && row.tag_retail !== '' ? `${price} · retail ${money(row.tag_retail)}` : price;
}

/** The right price or retail, when the finder gave one ('' when not). */
export function shouldBe(row: Pick<BadTag, 'right_price' | 'right_retail'>): string {
  const parts = [];
  if (row.right_price) parts.push(money(row.right_price));
  if (row.right_retail) parts.push(`retail ${money(row.right_retail)}`);
  return parts.join(' · ');
}

/** Where the item came from: "PO-1234 · row 56 · pallet 3" ('-' with no trace). */
export function traceLine(trace: BadTagTrace): string {
  const parts = [];
  if (trace.order_number) parts.push(trace.order_number);
  if (trace.manifest_row_number != null) parts.push(`row ${trace.manifest_row_number}`);
  if (trace.pallet) parts.push(`pallet ${trace.pallet.number}`);
  return parts.length ? parts.join(' · ') : '-';
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'MMM d, h:mm a');
  } catch {
    return '-';
  }
}

/** "Maria · Oct 21, 2:14 PM" ('-' when nobody is known). */
export function whoWhen(name: string | null | undefined, iso: string | null | undefined): string {
  const parts = [name || '', iso ? when(iso) : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
}

/** Chip colour per reason: a wrong item or missing tag is red; a wrong number is amber. */
export function reasonColor(reason: BadTagReason): 'error' | 'warning' {
  return reason === 'wrong_item' || reason === 'missing' ? 'error' : 'warning';
}

/** Errors per 100 tags checked in that week, one decimal; null with nothing checked in. */
export function ratePer100(errors: number, checkedIn: number): number | null {
  if (!(checkedIn > 0)) return null;
  return Math.round((errors * 1000) / checkedIn) / 10;
}

/** A short label for the processor filter chip, from the rows when one is loaded. */
export function processorName(rows: BadTag[], id: number): string {
  return rows.find((r) => r.trace.checked_in_by_id === id)?.trace.checked_in_by || `#${id}`;
}

export function truckName(rows: BadTag[], id: number): string {
  return rows.find((r) => r.trace.purchase_order_id === id)?.trace.order_number || `#${id}`;
}
