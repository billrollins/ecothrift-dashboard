/**
 * One history for the bench: past actions plus the desk events that answer
 * why we priced like this and what took so long.
 *
 * The open action is not in this list — it already sits on top of the panel.
 */
import type {
  ItemNoteDTO,
  RestorationActionCategory,
  RestorationActionDTO,
  RestorationTimelineEventDTO,
} from '../../../types/inventory.types';
import { categoryMeta, isCannedActionDescription } from './tarsActions';

export const WORK_HISTORY_FILTERS = ['inspect', 'test', 'assemble', 'repair', 'salvage'] as const;
export const DESK_HISTORY_FILTERS = ['notes', 'grades', 'estimates', 'parts', 'progress'] as const;

export type TarsHistoryFilter =
  | 'all'
  | 'actions'
  | 'non_actions'
  | (typeof WORK_HISTORY_FILTERS)[number]
  | (typeof DESK_HISTORY_FILTERS)[number];

export type TarsHistoryKind = 'action' | 'event';

export interface TarsHistoryRow {
  id: string;
  at: string;
  filter: Exclude<TarsHistoryFilter, 'all' | 'actions' | 'non_actions'>;
  kind: TarsHistoryKind;
  title: string;
  detail: string;
  actor: string;
  actorId: number | null;
  durationSeconds?: number;
  actionId?: number;
  eventId?: number;
  eventType?: RestorationTimelineEventDTO['event_type'];
  entityId?: string;
  payload?: Record<string, unknown>;
}

export type HistoryRowAffordance = 'clear-note' | 'clear-event' | 'reset-note' | 'none';

export interface HistoryClearContext {
  rows: TarsHistoryRow[];
  actions: RestorationActionDTO[];
  currentUserId: number | null;
  /** Finished jobs stay closed for non-comment deletes. Comments still follow the lock. */
  closed?: boolean;
}

const PINNED_EVENT_TYPES = new Set([
  'job.sent',
  'processing.checked_in',
  'parts.order_requested',
  'parts.order_approved',
  'parts.order_denied',
  'parts.order_purchased',
  'parts.order_eta_revised',
  'parts.order_received',
  'parts.order_reviewed',
  'parts.order_inspected',
  'parts.order_cancelled',
  'parts.order_withdrawn',
  'parts.cancel_asked',
  'parts.cancel_confirmed',
  'parts.cancel_refused',
  'valuation.requested',
  'valuation.fulfilled',
  'return.to_processing',
]);


const PROGRESS = new Set([
  'job.sent',
  'job.checked_in',
  'hold.placed',
  'hold.resumed',
  'job.moved_to_queue',
  'disposition.completed',
  'disposition.revised',
  'job.reopened',
  'return.to_processing',
  'processing.checked_in',
  'grade.claimed',
]);

const GRADES = new Set([
  'valuation.requested',
  'valuation.values_changed',
  'valuation.fulfilled',
]);

const PARTS = new Set([
  'parts.order_requested',
  'parts.order_approved',
  'parts.order_denied',
  'parts.order_purchased',
  'parts.order_eta_revised',
  'parts.order_received',
  'parts.order_reviewed',
  'parts.order_inspected',
  'parts.order_cancelled',
  'parts.order_withdrawn',
  'parts.cancel_asked',
  'parts.cancel_confirmed',
  'parts.cancel_refused',
]);

const ESTIMATES = new Set(['plan.estimate_changed']);

const NOTES = new Set(['note.queue_changed', 'note.added']);

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asMoney(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `$${value}`;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? `$${n}` : value.trim();
  }
  return null;
}

function eventFilter(eventType: string): Exclude<TarsHistoryFilter, 'all' | 'actions' | 'non_actions'> | null {
  if (NOTES.has(eventType)) return 'notes';
  if (GRADES.has(eventType)) return 'grades';
  if (ESTIMATES.has(eventType)) return 'estimates';
  if (PARTS.has(eventType)) return 'parts';
  if (PROGRESS.has(eventType)) return 'progress';
  return null;
}

function eventTitle(event: RestorationTimelineEventDTO): string {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case 'job.sent':
      return 'Sent to restoration';
    case 'job.checked_in':
      return 'Checked in';
    case 'hold.placed':
      return asText(p.reason) ? `Held · ${asText(p.reason)}` : 'Held';
    case 'hold.resumed':
      return 'Back on bench';
    case 'job.moved_to_queue':
      return asText(p.reason) ? `Back to queue · ${asText(p.reason)}` : 'Back to queue';
    case 'disposition.completed':
      return asText(p.final_grade) ? `Finished as ${asText(p.final_grade)}` : 'Finished';
    case 'disposition.revised':
      return 'Finish revised';
    case 'job.reopened':
      return 'Reopened';
    case 'return.to_processing':
      return 'Returned to Processing';
    case 'processing.checked_in':
      return 'Processing checked in';
    case 'valuation.requested':
      return 'Prices requested';
    case 'valuation.values_changed': {
      const scaleFrom = asText(p.previous_scale);
      const scaleTo = asText(p.scale);
      if (scaleFrom && scaleTo && scaleFrom !== scaleTo) return 'Scale changed';
      return 'Sell-as changed';
    }
    case 'valuation.fulfilled':
      return 'Prices filled in';
    case 'parts.order_requested':
      return asText(p.name) ? `Parts requested · ${asText(p.name)}` : 'Parts requested';
    case 'parts.order_approved':
      return asText(p.name) ? `Parts approved · ${asText(p.name)}` : 'Parts approved';
    case 'parts.order_denied':
      return asText(p.name) ? `Parts denied · ${asText(p.name)}` : 'Parts denied';
    case 'parts.order_purchased':
      return asText(p.name) ? `Parts purchased · ${asText(p.name)}` : 'Parts purchased';
    case 'parts.order_eta_revised':
      return asText(p.name) ? `Delivery updated · ${asText(p.name)}` : 'Delivery updated';
    case 'parts.order_received':
      return asText(p.name) ? `Parts received · ${asText(p.name)}` : 'Parts received';
    case 'parts.order_reviewed':
      return asText(p.name) ? `Parts reviewed · ${asText(p.name)}` : 'Parts reviewed';
    case 'parts.order_inspected':
      return asText(p.name) ? `Parts filed · ${asText(p.name)}` : 'Parts filed';
    case 'parts.order_cancelled':
      return asText(p.name) ? `Parts cancelled · ${asText(p.name)}` : 'Parts cancelled';
    case 'parts.order_withdrawn':
      return asText(p.name) ? `Parts withdrawn · ${asText(p.name)}` : 'Parts withdrawn';
    case 'parts.cancel_asked':
      return asText(p.name) ? `Cancel asked · ${asText(p.name)}` : 'Cancel asked';
    case 'parts.cancel_confirmed':
      return asText(p.name) ? `Cancel confirmed · ${asText(p.name)}` : 'Cancel confirmed';
    case 'parts.cancel_refused':
      return asText(p.name) ? `Cancel kept · ${asText(p.name)}` : 'Cancel kept';
    case 'grade.claimed': {
      const field = asText(p.field) === 'current' ? 'Current' : 'Original';
      const grade = asText(p.grade) || '—';
      return `${field} set to ${grade}`;
    }
    case 'plan.estimate_changed':
      return asText(p.grade) ? `${asText(p.grade)} estimate` : 'Estimate changed';
    case 'note.queue_changed':
      return 'Queue note';
    case 'note.added':
      return 'Note';
    default:
      return event.event_type;
  }
}

function eventDetail(event: RestorationTimelineEventDTO): string {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case 'hold.placed':
      return asText(p.story) || asText(p.notes) || asText(p.note);
    case 'job.moved_to_queue':
    case 'disposition.completed':
    case 'disposition.revised':
    case 'return.to_processing':
      return asText(p.notes) || asText(p.note);
    case 'valuation.values_changed': {
      const scaleFrom = asText(p.previous_scale);
      const scaleTo = asText(p.scale);
      const scaleBit = scaleFrom && scaleTo && scaleFrom !== scaleTo
        ? `${scaleFrom} → ${scaleTo}`
        : '';
      return [scaleBit, priceChangeDetail(p.previous_values, p.values)].filter(Boolean).join(' · ');
    }
    case 'valuation.requested':
      return asText(p.notes);
    case 'grade.claimed': {
      const previous = asText(p.previous);
      return previous ? `was ${previous}` : '';
    }
    case 'plan.estimate_changed': {
      const bits: string[] = [];
      if ('parts_from' in p || 'parts_to' in p) {
        bits.push(`parts ${asMoney(p.parts_from) ?? '—'} → ${asMoney(p.parts_to) ?? '—'}`);
      }
      if ('minutes_from' in p || 'minutes_to' in p) {
        bits.push(`mins ${p.minutes_from ?? '—'} → ${p.minutes_to ?? '—'}`);
      }
      return bits.join(' · ');
    }
    case 'note.queue_changed': {
      const previous = asText(p.previous) || '—';
      const next = asText(p.next) || '—';
      return `${previous} → ${next}`;
    }
    case 'note.added':
      return asText(p.body);
    case 'parts.order_requested':
    case 'parts.order_purchased':
    case 'parts.order_received':
    case 'parts.order_reviewed':
    case 'parts.order_inspected':
      return [asText(p.target_grade), asMoney(p.total), asText(p.note)].filter(Boolean).join(' · ');
    case 'parts.order_eta_revised': {
      const previous = asText(p.previous_on) || '-';
      const next = asText(p.expected_delivery_on) || '-';
      return `${previous} → ${next}`;
    }
    case 'parts.order_denied':
      return asText(p.reason);
    default:
      return asText(p.notes) || asText(p.note);
  }
}

/** Directory form: Last, First. One-word names stay as they are. */
export function formatHistoryWho(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Staff';
  if (trimmed.includes(',')) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

/** Last, First, shortened to fit the who slot. */
export function displayHistoryWho(name: string, max = 14): string {
  return truncateHistoryWho(formatHistoryWho(name), max);
}

/** Fit the who slot: Last, First → Last, F → clipped last. */
export function truncateHistoryWho(formatted: string, max = 14): string {
  if (formatted.length <= max) return formatted;
  const comma = formatted.indexOf(', ');
  if (comma > 0) {
    const last = formatted.slice(0, comma);
    const initial = formatted.slice(comma + 2).charAt(0);
    const short = initial ? `${last}, ${initial}` : last;
    if (short.length <= max) return short;
    return `${last.slice(0, Math.max(1, max - 1))}…`;
  }
  return `${formatted.slice(0, Math.max(1, max - 1))}…`;
}

function actionRow(action: RestorationActionDTO): TarsHistoryRow {
  const meta = categoryMeta(action.category);
  return {
    id: `action:${action.id}`,
    at: action.started_at,
    filter: action.category,
    kind: 'action',
    title: meta.label,
    detail: action.description.trim(),
    actor: formatHistoryWho(action.created_by_name ?? ''),
    actorId: action.created_by ?? null,
    durationSeconds: action.seconds || undefined,
    actionId: action.id,
  };
}

function eventRow(event: RestorationTimelineEventDTO): TarsHistoryRow | null {
  if (event.status !== 'active') return null;
  const filter = eventFilter(event.event_type);
  if (filter == null) return null;
  return {
    id: `event:${event.id}`,
    at: event.occurred_at,
    filter,
    kind: 'event',
    title: eventTitle(event),
    detail: eventDetail(event),
    actor: formatHistoryWho(event.actor_name ?? ''),
    actorId: event.actor_id ?? null,
    eventId: event.id,
    eventType: event.event_type,
    entityId: event.entity_id,
    payload: event.payload ?? {},
  };
}

function asPriceKey(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : value.trim();
  }
  return null;
}

function valuesMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Only grades whose price actually moved, old → new. */
export function priceChangeDetail(previous: unknown, next: unknown): string {
  const before = valuesMap(previous);
  const after = valuesMap(next);
  const grades = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const bits: string[] = [];
  for (const grade of grades) {
    const fromKey = asPriceKey(before[grade]);
    const toKey = asPriceKey(after[grade]);
    if (fromKey === toKey) continue;
    bits.push(`${grade} ${asMoney(before[grade]) ?? '—'} → ${asMoney(after[grade]) ?? '—'}`);
  }
  return bits.join(' · ');
}

function atMs(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isSplitterAction(action: RestorationActionDTO): boolean {
  return !isCannedActionDescription(action.description);
}

function lastSplitterId(at: string, actions: RestorationActionDTO[]): number {
  const t = atMs(at);
  let id = 0;
  let started = Number.NEGATIVE_INFINITY;
  for (const action of actions) {
    if (!isSplitterAction(action)) continue;
    const when = atMs(action.started_at);
    if (when < t && when >= started) {
      started = when;
      id = action.id;
    }
  }
  return id;
}

function changedFields(
  eventType: string | undefined,
  payload: Record<string, unknown>,
): string[] {
  if (eventType === 'plan.estimate_changed') {
    const fields: string[] = [];
    if ('parts_to' in payload || 'parts_from' in payload) fields.push('parts');
    if ('minutes_to' in payload || 'minutes_from' in payload) fields.push('minutes');
    return fields.length > 0 ? fields : ['*'];
  }
  if (eventType === 'valuation.values_changed') {
    const fields: string[] = [];
    const scale = asText(payload.scale);
    const previous = asText(payload.previous_scale);
    if (scale && previous && scale !== previous) fields.push('scale');
    const before = valuesMap(payload.previous_values);
    const after = valuesMap(payload.values);
    for (const grade of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (asPriceKey(before[grade]) !== asPriceKey(after[grade])) fields.push(`price:${grade}`);
    }
    return fields.length > 0 ? fields : ['*'];
  }
  return ['*'];
}

function fieldsCovered(row: TarsHistoryRow, later: TarsHistoryRow[]): boolean {
  const mine = changedFields(row.eventType, row.payload ?? {});
  const covered = new Set<string>();
  for (const next of later) {
    for (const field of changedFields(next.eventType, next.payload ?? {})) {
      covered.add(field);
    }
  }
  if (covered.has('*')) return true;
  return mine.every((field) => field === '*' || covered.has(field));
}

function supersededEventIds(ctx: HistoryClearContext): Set<number> {
  const groups = new Map<string, TarsHistoryRow[]>();
  for (const row of ctx.rows) {
    if (row.kind !== 'event' || row.eventId == null || !row.entityId) continue;
    if (row.eventType && PINNED_EVENT_TYPES.has(row.eventType)) continue;
    const key = `${row.entityId}::${lastSplitterId(row.at, ctx.actions)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const ids = new Set<number>();
  for (const group of groups.values()) {
    group.sort((a, b) => atMs(b.at) - atMs(a.at) || b.id.localeCompare(a.id));
    for (let i = 1; i < group.length; i += 1) {
      const row = group[i];
      if (fieldsCovered(row, group.slice(0, i))) ids.add(row.eventId!);
    }
  }
  return ids;
}

export function isCommentRow(row: TarsHistoryRow): boolean {
  return row.eventType === 'note.queue_changed' || row.eventType === 'note.added';
}

export function historyCommentNote(
  row: TarsHistoryRow,
  notes: ItemNoteDTO[],
): ItemNoteDTO | undefined {
  if (!isCommentRow(row)) return undefined;
  const id = row.payload?.item_note_id;
  if (typeof id === 'number') {
    return notes.find((note) => note.id === id && note.status === 'active');
  }
  const body = String(row.payload?.next ?? row.payload?.body ?? row.detail ?? '').trim();
  if (!body) return undefined;
  return notes.find((note) => note.status === 'active' && note.body === body);
}

function noteIsLocked(row: TarsHistoryRow, ctx: HistoryClearContext): boolean {
  const t = atMs(row.at);
  const me = ctx.currentUserId;
  if (me == null) return true;
  if (ctx.actions.some((action) => atMs(action.started_at) > t && action.created_by !== me)) {
    return true;
  }
  return ctx.rows.some(
    (other) =>
      isCommentRow(other) &&
      other.id !== row.id &&
      atMs(other.at) > t &&
      other.actorId !== me,
  );
}

function latestNoteEventId(rows: TarsHistoryRow[]): number | null {
  const notes = rows
    .filter((row) => row.eventType === 'note.queue_changed' && row.eventId != null)
    .sort((a, b) => atMs(b.at) - atMs(a.at) || b.id.localeCompare(a.id));
  return notes[0]?.eventId ?? null;
}

function noteIsClearable(row: TarsHistoryRow, ctx: HistoryClearContext): boolean {
  if (!isCommentRow(row)) return false;
  if (row.actorId == null || row.actorId !== ctx.currentUserId) return false;
  return !noteIsLocked(row, ctx);
}

export function historyRowAffordance(
  row: TarsHistoryRow,
  ctx: HistoryClearContext,
): HistoryRowAffordance {
  if (row.kind === 'action') return 'none';
  if (row.eventType && PINNED_EVENT_TYPES.has(row.eventType)) return 'none';
  if (isCommentRow(row)) {
    if (!noteIsClearable(row, ctx)) return 'none';
    if (
      row.eventType === 'note.queue_changed' &&
      row.eventId != null &&
      row.eventId === latestNoteEventId(ctx.rows)
    ) {
      return 'reset-note';
    }
    return 'clear-note';
  }
  if (ctx.closed) return 'none';
  if (row.eventId != null && supersededEventIds(ctx).has(row.eventId)) return 'clear-event';
  return 'none';
}

export function mergeBenchHistory(
  actions: RestorationActionDTO[],
  events: RestorationTimelineEventDTO[],
  currentActionId: number | null,
): TarsHistoryRow[] {
  const rows: TarsHistoryRow[] = [];
  for (const action of actions) {
    if (action.id === currentActionId) continue;
    rows.push(actionRow(action));
  }
  for (const event of events) {
    const row = eventRow(event);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => {
    const byTime = b.at.localeCompare(a.at);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
}

export function filterBenchHistory(
  rows: TarsHistoryRow[],
  filter: TarsHistoryFilter,
): TarsHistoryRow[] {
  if (filter === 'all') return rows;
  if (filter === 'actions') {
    return rows.filter((row) =>
      (WORK_HISTORY_FILTERS as readonly string[]).includes(row.filter),
    );
  }
  if (filter === 'non_actions') {
    return rows.filter((row) =>
      (DESK_HISTORY_FILTERS as readonly string[]).includes(row.filter),
    );
  }
  return rows.filter((row) => row.filter === filter);
}

export interface ClearableHistorySummary {
  notes: number;
  superseded: number;
}

export function summarizeClearableHistory(ctx: HistoryClearContext): ClearableHistorySummary {
  const summary: ClearableHistorySummary = { notes: 0, superseded: 0 };
  for (const row of ctx.rows) {
    const affordance = historyRowAffordance(row, ctx);
    if (affordance === 'clear-note') summary.notes += 1;
    else if (affordance === 'clear-event') summary.superseded += 1;
  }
  return summary;
}

export function clearableHistoryTotal(summary: ClearableHistorySummary): number {
  return summary.notes + summary.superseded;
}

export function clearableHistoryLines(summary: ClearableHistorySummary): string[] {
  const lines: string[] = [];
  if (summary.notes > 0) {
    lines.push(
      `${summary.notes} of your earlier notes — the current note stays`,
    );
  }
  if (summary.superseded > 0) {
    lines.push(
      `${summary.superseded} earlier answer${summary.superseded === 1 ? '' : 's'} — the latest of each kind since the last sitting stays`,
    );
  }
  return lines;
}

export function isWorkHistoryFilter(
  filter: TarsHistoryFilter,
): filter is RestorationActionCategory {
  return (WORK_HISTORY_FILTERS as readonly string[]).includes(filter);
}
