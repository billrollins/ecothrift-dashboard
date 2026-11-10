/**
 * Words and numbers for the money blocks at the top of Processing and in the Truck Plan window (Dash Update #81).
 * The sums are done on the server (`apps/inventory/services/truck_plan.py`); this file only says them.
 */
import type { TruckDisputesDTO, TruckOnTrackDTO, TruckPlanDTO, TruckSummaryDTO } from '../../../api/truckPlan.api';

export type SummaryTone = 'default' | 'good' | 'warning' | 'error';

export interface SummaryHeadline {
  value: string;
  helper: string;
  tone: SummaryTone;
  /** The lines behind the number: shown on hover and when the block is clicked. */
  detail: string[];
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** $1,234.50 */
export function money(v: string | number | null | undefined): string {
  const n = num(v);
  if (n == null) return '-';
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** $1,235: the big number on a block. */
export function moneyWhole(v: string | number | null | undefined): string {
  const n = num(v);
  if (n == null) return '-';
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

export function count(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1);
}

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** "$720 over" / "$1,300 under" the target. */
export function overUnder(vsTarget: string | null | undefined): { text: string; tone: SummaryTone } {
  const n = num(vsTarget);
  if (n == null) return { text: 'No target yet', tone: 'default' };
  if (Math.round(Math.abs(n)) === 0) return { text: 'On target', tone: 'good' };
  return n > 0
    ? { text: `${moneyWhole(n)} over`, tone: 'good' }
    : { text: `${moneyWhole(-n)} under`, tone: 'warning' };
}

export function paidHeadline(s: TruckSummaryDTO | undefined): SummaryHeadline {
  if (!s) return { value: '-', helper: 'Price + fees + shipping', tone: 'default', detail: [] };
  const p = s.paid;
  return {
    value: moneyWhole(p.total),
    helper: p.total == null ? 'No cost on the order yet' : 'Price + fees + shipping',
    tone: 'default',
    detail: [
      `Price: ${money(p.price)}`,
      `Fees: ${money(p.fees)}`,
      `Shipping: ${money(p.shipping)}`,
      `Paid: ${money(p.total)}`,
    ],
  };
}

export function targetHeadline(s: TruckSummaryDTO | undefined): SummaryHeadline {
  if (!s) return { value: '-', helper: '2 x Paid', tone: 'default', detail: [] };
  const t = s.target;
  const helper = t.total == null ? 'No cost on the order yet' : t.is_default ? '2 x Paid' : `Set by ${t.set_by || 'a superuser'}`;
  const detail = t.is_default
    ? [`Target Price total: ${money(t.total)}`, '2 x what we paid, until a superuser sets another total.']
    : [
        `Target Price total: ${money(t.total)}`,
        `Set by ${t.set_by || 'a superuser'}${t.set_at ? ` on ${shortDay(t.set_at)}` : ''}.`,
        `2 x Paid would be ${money(t.default)}.`,
      ];
  return { value: moneyWhole(t.total), helper, tone: 'default', detail };
}

function rateLine(t: TruckOnTrackDTO): string | null {
  if (!t.units_by_rate || t.rate_pct == null) return null;
  const from = t.rate_basis === 'plan' ? "the plan's start point" : 'this truck so far';
  return `${plural(t.units_by_rate, 'unit uses', 'units use')} retail x ${t.rate_pct}% (${from}).`;
}

export function onTrackHeadline(s: TruckSummaryDTO | undefined): SummaryHeadline {
  if (!s) return { value: '-', helper: 'Against the target', tone: 'default', detail: [] };
  const t = s.on_track;
  const vs = overUnder(t.vs_target);
  const detail = [
    `Tags so far: ${money(t.priced_so_far)} on ${plural(t.priced_items, 'item', 'items')}.`,
    `Estimate for ${plural(t.units_left, 'unit', 'units')} on lines still open: ${money(t.estimated_left)}.`,
  ];
  if (t.units_own_price) detail.push(`${plural(t.units_own_price, 'unit uses', 'units use')} the price on its line.`);
  const rate = rateLine(t);
  if (rate) detail.push(rate);
  if (t.units_no_estimate) {
    detail.push(`${plural(t.units_no_estimate, 'unit has', 'units have')} no estimate yet. A pricing start in the Truck Plan fills them in.`);
  }
  detail.push(`On track: ${money(t.total)}. Target: ${money(s.target.total)}.`);
  if (vs.tone === 'good' && vs.text !== 'On target') detail.push('Over the target: there is room to price lower.');
  if (vs.tone === 'warning') detail.push('Under the target: price higher where the item can take it.');
  return { value: moneyWhole(t.total), helper: vs.text, tone: vs.tone, detail };
}

export function disputedHeadline(s: TruckSummaryDTO | undefined): SummaryHeadline {
  if (!s) return { value: '-', helper: 'Disputed so far', tone: 'default', detail: [] };
  const d = s.disputes;
  const line = d.threshold_retail != null ? `${count(d.threshold_pct)}% line ${moneyWhole(d.threshold_retail)}` : 'No retail on the manifest';
  return {
    value: moneyWhole(d.retail),
    helper: `${plural(d.items, 'item', 'items')} · ${line}`,
    tone: d.over_threshold ? 'warning' : 'default',
    detail: disputeDetail(d),
  };
}

export function disputeDetail(d: TruckDisputesDTO): string[] {
  const p = d.parts;
  const out = [
    `Not received: ${plural(p.not_received.units, 'unit', 'units')}, ${money(p.not_received.retail)} retail.`,
    `Broken: ${plural(p.broken.units, 'unit', 'units')}, ${money(p.broken.retail)} retail.`,
    `Damaged: ${plural(p.damaged.units, 'item', 'items')}, ${money(p.damaged.retail)} retail (each at its share of value lost).`,
    `Disputed so far: ${money(d.retail)}${d.retail_pct != null ? `, ${d.retail_pct}% of the truck's ${money(d.truck_retail)} retail` : ''}.`,
  ];
  if (d.threshold_retail != null) {
    out.push(`${count(d.threshold_pct)}% line: ${money(d.threshold_retail)}. B-Stock takes a dispute above it.`);
  }
  if (d.lines_without_retail) {
    out.push(`${plural(d.lines_without_retail, 'manifest line has', 'manifest lines have')} no retail and count in units only.`);
  }
  return out;
}

/** The sum behind "Dispute worth", in the order Bill says it. */
export function worthSum(d: TruckDisputesDTO): string {
  if (d.worth == null || d.truck_retail == null || d.threshold_retail == null) return 'Needs the truck retail and the price we paid.';
  return `(${money(d.retail)} - ${money(d.threshold_retail)}) / ${money(d.truck_retail)} x ${money(d.price_plus_fees)} = ${money(d.worth)}`;
}

export function worthHeadline(s: TruckSummaryDTO | undefined): SummaryHeadline {
  if (!s) return { value: '-', helper: 'So far, no shipping', tone: 'default', detail: [] };
  const d = s.disputes;
  const worth = num(d.worth);
  const detail = [
    `(Disputed retail - the ${count(d.threshold_pct)}% line) / truck retail x (price + fees).`,
    worthSum(d),
    'Never below $0. Shipping is not in it.',
  ];
  const gap = (num(d.threshold_retail) ?? 0) - (num(d.retail) ?? 0);
  if (d.threshold_retail != null && gap > 0) detail.push(`${money(gap)} more disputed retail reaches the line.`);
  return {
    value: moneyWhole(d.worth),
    helper: 'So far, no shipping',
    tone: worth != null && worth > 0 ? 'good' : 'default',
    detail,
  };
}

// --- dates ---------------------------------------------------------------------------------------------------------

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Nov 5 */
export function shortDay(value: string | null | undefined): string {
  const date = parseDay(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Weekdays from `from` to `to` (negative once it has passed). */
export function businessDaysUntil(to: Date, from: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  if (a.getTime() === b.getTime()) return 0;
  const forward = a < b;
  const cursor = new Date(forward ? a : b);
  const end = forward ? b : a;
  let n = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return forward ? n : -n;
}

export function disputeDueLabel(
  dates: TruckSummaryDTO['dates'] | undefined,
  today: Date = new Date(),
): { value: string; tooltip: string; tone: SummaryTone } {
  const due = parseDay(dates?.dispute_due);
  if (!dates || !due) return { value: '-', tooltip: 'Shows once the truck has a delivery date.', tone: 'default' };
  const left = businessDaysUntil(due, today);
  const day = shortDay(dates.dispute_due);
  const label = left > 1 ? `${left} days left` : left === 1 ? '1 day left' : left === 0 ? 'Today' : 'Closed';
  const why = dates.dispute_due_from_plan
    ? 'Set in the Truck Plan.'
    : `${dates.dispute_business_days} business days after delivery.`;
  return {
    value: `${day} · ${label}`,
    tooltip: left >= 0 ? `Dispute due ${day}. ${why}` : `The dispute window closed ${day}. ${why}`,
    tone: left < 0 ? 'default' : left <= 1 ? 'error' : 'default',
  };
}

// --- the plan line ---------------------------------------------------------------------------------------------

export interface PlanLinePart {
  label: string;
  text: string;
  /** Known issues stand out. */
  strong?: boolean;
}

/** The one line under the order bar: what the plan says, shortest first. Empty = nothing written in the plan. */
export function planLineParts(plan: TruckPlanDTO | null | undefined): PlanLinePart[] {
  if (!plan) return [];
  const one = (text: string) => text.replace(/\s+/g, ' ').trim();
  const parts: PlanLinePart[] = [];
  if (plan.pricing_start_pct) parts.push({ label: 'Start at', text: `${plan.pricing_start_pct}% of retail` });
  if (plan.crew.length) parts.push({ label: 'On it', text: plan.crew.map((c) => c.name.split(' ')[0]).join(', ') });
  if (one(plan.known_issues)) parts.push({ label: 'Issues', text: one(plan.known_issues), strong: true });
  if (one(plan.watch_for)) parts.push({ label: 'Watch for', text: one(plan.watch_for) });
  return parts;
}
