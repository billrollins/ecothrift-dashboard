import type { DeliveryRun, DeliveryRunPhase, DeliveryRunStop } from '../../../../types/pos.types';
import {
  currentDriveStop,
  flattenStopItemsQueue,
  normalizeFieldPhase,
  unconfirmedStops,
} from './fieldRunUtils';

export type FieldUiStep = 'contact' | 'load' | 'routes' | 'deliveries' | 'finish';

export type DotTone = 'complete' | 'pending' | 'caution' | 'issue' | 'active';

/** Contact terminal = green (confirmed) or red (issue). Yellow awaiting is not done. */
export const CONTACT_COMPLETE_DISPOSITIONS = new Set(['confirmed']);

export const CONTACT_ISSUE_DISPOSITIONS = new Set([
  'reschedule_requested',
  'cancel_requested',
  'wrong_number',
  'other',
]);

export const CONTACT_CAUTION_DISPOSITIONS = new Set([
  'awaiting_reply',
  'no_answer',
  'voicemail',
]);

export const FIELD_UI_STEPS: FieldUiStep[] = [
  'contact',
  'load',
  'routes',
  'deliveries',
  'finish',
];

export const FIELD_UI_STEP_LABELS: Record<FieldUiStep, string> = {
  contact: 'Contact',
  load: 'Load',
  routes: 'Routes',
  deliveries: 'Deliveries',
  finish: 'Finish',
};

export function uiStepFromPhase(phase: DeliveryRunPhase | string | undefined): FieldUiStep {
  const p = normalizeFieldPhase(phase);
  if (p === 'calls') return 'contact';
  if (p === 'load' || p === 'truck') return 'load';
  if (p === 'route') return 'routes';
  if (p === 'active') return 'deliveries';
  return 'finish';
}

export function phaseForUiStep(step: FieldUiStep, run: DeliveryRun): DeliveryRunPhase {
  if (step === 'contact') return 'calls';
  if (step === 'load') {
    return normalizeFieldPhase(run.phase) === 'truck' ? 'truck' : 'load';
  }
  if (step === 'routes') return 'route';
  if (step === 'deliveries') return 'active';
  return 'return';
}

/** Steps the user may open for review (current + earlier). */
export function unlockedUiSteps(run: DeliveryRun): FieldUiStep[] {
  if (run.status === 'completed') return [...FIELD_UI_STEPS];
  const current = uiStepFromPhase(run.phase);
  const idx = FIELD_UI_STEPS.indexOf(current);
  const unlocked = FIELD_UI_STEPS.slice(0, Math.max(idx, 0) + 1);
  const allowed = new Set(run.allowed_actions ?? []);
  // Unlock next step only when the server already exposes its transition/action.
  if (current === 'contact' && allowed.has('set_phase:load')) unlocked.push('load');
  if (current === 'load' && (allowed.has('set_phase:route') || allowed.has('begin_route'))) {
    unlocked.push('routes');
  }
  if (current === 'routes' && (allowed.has('begin_route') || normalizeFieldPhase(run.phase) === 'active')) {
    unlocked.push('deliveries');
  }
  if (
    current === 'deliveries' &&
    (allowed.has('return_store') || allowed.has('finish') || Boolean(run.returned_to_store_at))
  ) {
    unlocked.push('finish');
  }
  return Array.from(new Set(unlocked));
}

export function isUiStepUnlocked(run: DeliveryRun, step: FieldUiStep): boolean {
  return unlockedUiSteps(run).includes(step);
}

export function uiStepIndex(step: FieldUiStep): number {
  return FIELD_UI_STEPS.indexOf(step);
}

/**
 * Server phase advances should not yank a driver out of a step they deliberately
 * opened. Follow the live edge only when they were already sitting on it.
 */
export function resolveUiStepSync(input: {
  uiStep: FieldUiStep;
  serverStep: FieldUiStep;
  previousServerStep: FieldUiStep;
  manual: boolean;
}): FieldUiStep {
  const { uiStep, serverStep, previousServerStep, manual } = input;
  if (uiStepIndex(serverStep) <= uiStepIndex(uiStep)) return uiStep;
  if (!manual) return serverStep;
  return uiStep === previousServerStep ? serverStep : uiStep;
}

/** True when the driver is reviewing a step behind the live server phase. */
export function isBehindLiveStep(uiStep: FieldUiStep, serverStep: FieldUiStep): boolean {
  return uiStepIndex(uiStep) < uiStepIndex(serverStep);
}

export function stopDisplayName(stop: DeliveryRunStop): string {
  return (stop.customer_name || '').replace(/^\[TEST\]\s*/, '');
}

export function contactStopTone(stop: DeliveryRunStop): DotTone {
  const d = stop.contact_disposition || '';
  if (stop.state === 'failed' || CONTACT_ISSUE_DISPOSITIONS.has(d)) return 'issue';
  if (CONTACT_COMPLETE_DISPOSITIONS.has(d)) return 'complete';
  if (CONTACT_CAUTION_DISPOSITIONS.has(d)) return 'caution';
  return 'pending';
}

/** True when contact work on this stop is finished (green or red). */
export function isContactTerminal(stop: DeliveryRunStop): boolean {
  const tone = contactStopTone(stop);
  return tone === 'complete' || tone === 'issue';
}

/** Any recorded contact outcome (including yellow pending / no-answer). */
export function hasContactOutcome(stop: DeliveryRunStop): boolean {
  return Boolean((stop.contact_disposition || '').trim());
}

/** Contact step is done once every stop has an outcome - then continue to Load. */
export function contactWorkComplete(stops: DeliveryRunStop[]): boolean {
  return stops.length > 0 && stops.every(hasContactOutcome);
}

/** Reschedule / cancel are not loaded onto the truck. */
export const LOAD_EXCLUDED_DISPOSITIONS = new Set([
  'reschedule_requested',
  'cancel_requested',
]);

export function isExcludedFromLoad(stop: DeliveryRunStop): boolean {
  if (stop.state === 'rescheduled') return true;
  return LOAD_EXCLUDED_DISPOSITIONS.has(stop.contact_disposition || '');
}

/**
 * Routes step colors:
 * green = YES include on route (and on truck), yellow = pending decision,
 * red = NO NOT TODAY.
 *
 * Confirmed-but-not-loaded stops stay yellow until removed or loaded - seal may
 * leave them off the truck, but Start Deliveries cannot.
 */
export function routeInclusionTone(stop: DeliveryRunStop): DotTone {
  const d = stop.contact_disposition || '';
  if (
    stop.excluded_unconfirmed ||
    stop.state === 'rescheduled' ||
    CONTACT_ISSUE_DISPOSITIONS.has(d)
  ) {
    return 'issue';
  }
  if (stop.is_confirmed && !stop.excluded_unconfirmed) {
    return stopIsOnTruck(stop) ? 'complete' : 'caution';
  }
  return 'caution';
}

export function isOnRoute(stop: DeliveryRunStop): boolean {
  return Boolean(stop.is_confirmed) && !stop.excluded_unconfirmed;
}

/** Stops that still need an Add/Remove/load decision before Start Deliveries. */
export function pendingRouteDecisionStops(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((stop) => {
    if (routeInclusionTone(stop) === 'caution') return true;
    if (isOnRoute(stop) && !stopIsOnTruck(stop)) return true;
    return false;
  });
}

export function loadStopTone(stop: DeliveryRunStop): DotTone {
  const items = stop.stop_items ?? [];
  if (!items.length) {
    return stop.items_ready_count != null &&
      stop.items_total_count != null &&
      stop.items_total_count > 0 &&
      stop.items_ready_count >= stop.items_total_count
      ? 'complete'
      : 'pending';
  }
  // Green when every line is scanned/skipped and loaded (truck photos are a separate closeout step).
  if (items.every((item) => item.is_ready)) return 'complete';
  if (items.some((item) => item.is_verified || item.verification_skipped || item.loaded_at)) {
    return 'pending';
  }
  return 'pending';
}

/** Stop is on the truck when every item line is ready (or legacy stop.loaded_at with no items). */
export function stopIsOnTruck(stop: DeliveryRunStop): boolean {
  const items = stop.stop_items ?? [];
  if (!items.length) return Boolean(stop.loaded_at);
  return items.every((item) => item.is_ready);
}

/** Earliest item loaded_at (ms), or stop.loaded_at, or Infinity if unknown. */
export function stopLoadedAtMs(stop: DeliveryRunStop): number {
  const times = (stop.stop_items ?? [])
    .map((item) => (item.loaded_at ? Date.parse(item.loaded_at) : NaN))
    .filter((n) => Number.isFinite(n));
  if (times.length) return Math.min(...times);
  if (stop.loaded_at) {
    const n = Date.parse(stop.loaded_at);
    if (Number.isFinite(n)) return n;
  }
  return Number.POSITIVE_INFINITY;
}

export function partitionLoadBoardStops(stops: DeliveryRunStop[]): {
  onTruck: DeliveryRunStop[];
  notOnTruck: DeliveryRunStop[];
} {
  const onTruck: DeliveryRunStop[] = [];
  const notOnTruck: DeliveryRunStop[] = [];
  for (const stop of stops) {
    if (stopIsOnTruck(stop)) onTruck.push(stop);
    else notOnTruck.push(stop);
  }
  onTruck.sort((a, b) => {
    const diff = stopLoadedAtMs(a) - stopLoadedAtMs(b);
    if (diff !== 0) return diff;
    return a.position - b.position || a.id - b.id;
  });
  notOnTruck.sort((a, b) => a.position - b.position || a.id - b.id);
  return { onTruck, notOnTruck };
}

/** Stop still needs scan/skip before a silent quick-load is safe. */
export function stopNeedsScanBeforeLoad(stop: DeliveryRunStop): boolean {
  return (stop.stop_items ?? []).some(
    (item) => !item.is_verified && !item.verification_skipped,
  );
}

/** Compact "3 items" label for summary rows. */
export function stopItemCountLabel(stop: DeliveryRunStop): string {
  const items = stop.stop_items ?? [];
  const n = items.length || stop.item_count || 0;
  if (!n) return '0 items';
  if (items.length) {
    const qty = items.reduce((sum, i) => sum + Math.max(1, i.quantity || 1), 0);
    if (qty !== n) return `${n} lines`;
  }
  return `${n} item${n === 1 ? '' : 's'}`;
}

/**
 * One-line item names for Load summary cards.
 * e.g. "Couch · Lamp · +1"
 */
export function compactStopItemSummary(stop: DeliveryRunStop, maxNames = 2): string {
  const items = stop.stop_items ?? [];
  if (!items.length) {
    const n = stop.item_count || 0;
    return n ? `${n} item${n === 1 ? '' : 's'}` : 'No items';
  }
  const names = items.map((i) => i.description || i.sku || 'Item');
  if (names.length <= maxNames) return names.join(' · ');
  return `${names.slice(0, maxNames).join(' · ')} · +${names.length - maxNames}`;
}

export function deliveryStopTone(stop: DeliveryRunStop): DotTone {
  if (stop.state === 'completed') return 'complete';
  if (stop.state === 'on_hold' || stop.state === 'failed' || stop.hold_reason) return 'issue';
  return 'pending';
}

export function finishStopTone(stop: DeliveryRunStop): DotTone {
  if (stop.return_reconciled_at || stop.state === 'completed') return 'complete';
  if (stop.state === 'on_hold' || stop.state === 'failed' || stop.hold_reason) return 'issue';
  return 'pending';
}

export function stopsForUiStep(run: DeliveryRun, step: FieldUiStep): DeliveryRunStop[] {
  const stops = [...(run.stops ?? [])].sort((a, b) => a.position - b.position || a.id - b.id);
  if (step === 'contact') return stops;
  // Load everyone with an outcome except reschedule / cancel.
  if (step === 'load') return stops.filter((s) => !isExcludedFromLoad(s));
  // Routes reviews every contact; inclusion is shown by tone / actions.
  if (step === 'routes') return stops;
  if (step === 'deliveries') {
    return stops.filter(
      (s) =>
        s.is_confirmed &&
        s.state !== 'rescheduled' &&
        s.state !== 'failed',
    );
  }
  // Finish: exceptions that need reconcile (held/failed/unconfirmed leftovers).
  return stops.filter(
    (s) =>
      s.state !== 'completed' &&
      !s.return_reconciled_at &&
      (s.state === 'on_hold' ||
        s.state === 'failed' ||
        Boolean(s.hold_reason) ||
        (!s.is_confirmed && Boolean(s.contact_disposition))),
  );
}

export function toneForUiStep(step: FieldUiStep, stop: DeliveryRunStop): DotTone {
  if (step === 'contact') return contactStopTone(stop);
  if (step === 'load') return loadStopTone(stop);
  if (step === 'routes') return routeInclusionTone(stop);
  if (step === 'deliveries') return deliveryStopTone(stop);
  if (step === 'finish') return finishStopTone(stop);
  return 'pending';
}

export function defaultSelectedStopId(run: DeliveryRun, step: FieldUiStep): number | null {
  const stops = stopsForUiStep(run, step);
  if (!stops.length) return null;
  if (step === 'contact') {
    const open = stops.find((s) => !hasContactOutcome(s));
    return (open ?? stops[0]).id;
  }
  if (step === 'routes') {
    const off = stops.find((s) => routeInclusionTone(s) !== 'complete');
    return (off ?? stops[0])?.id ?? null;
  }
  if (step === 'load') {
    const incomplete = stops.find((s) => loadStopTone(s) !== 'complete');
    return (incomplete ?? stops[0]).id;
  }
  if (step === 'deliveries') {
    const current = currentDriveStop(run);
    if (current && stops.some((s) => s.id === current.id)) return current.id;
    const pending = stops.find((s) => deliveryStopTone(s) === 'pending');
    return (pending ?? stops[0]).id;
  }
  if (step === 'finish') {
    const pending = stops.find((s) => finishStopTone(s) !== 'complete');
    return (pending ?? stops[0])?.id ?? null;
  }
  return stops[0]?.id ?? null;
}

export function clampSelectedStopId(
  stops: DeliveryRunStop[],
  selectedId: number | null | undefined,
  fallbackId: number | null,
): number | null {
  if (selectedId != null && stops.some((s) => s.id === selectedId)) return selectedId;
  return fallbackId ?? stops[0]?.id ?? null;
}

export function nextPendingStopId(
  stops: DeliveryRunStop[],
  currentId: number,
  isComplete: (stop: DeliveryRunStop) => boolean,
): number | null {
  const idx = stops.findIndex((s) => s.id === currentId);
  if (idx < 0) return stops.find((s) => !isComplete(s))?.id ?? null;
  for (let i = idx + 1; i < stops.length; i += 1) {
    if (!isComplete(stops[i])) return stops[i].id;
  }
  for (let i = 0; i < idx; i += 1) {
    if (!isComplete(stops[i])) return stops[i].id;
  }
  return null;
}

export function loadItemsForStop(run: DeliveryRun, stopId: number) {
  return flattenStopItemsQueue(run).filter(({ stop }) => stop.id === stopId);
}

export function sidelinedStops(run: DeliveryRun): DeliveryRunStop[] {
  return unconfirmedStops(run);
}

/** @deprecated Prefer width-normalized swipe helpers below. */
export const SWIPE_THRESHOLD_PX = 56;

/** Ignore finger jitter before locking horizontal vs vertical. */
export const SWIPE_AXIS_LOCK_PX = 10;

/**
 * Fraction of card width ignored before visual progress starts.
 * Matches the "10-20% dead zone" feel on phones.
 */
export const SWIPE_DEAD_ZONE_RATIO = 0.15;

/**
 * Fraction of card width that equals 100% progress / commit.
 * Crossing this (or releasing above it) advances exactly one card.
 */
export const SWIPE_COMMIT_RATIO = 0.38;

/** How far past the end the card may travel before rubber-banding. */
export const SWIPE_EDGE_RESISTANCE = 0.35;

export type SwipeDirection = -1 | 0 | 1;

export function clamp01(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Horizontal distance needed for a full commit at the given card width. */
export function swipeCommitDistance(cardWidth: number): number {
  return Math.max(120, cardWidth * SWIPE_COMMIT_RATIO);
}

/** Dead-zone distance before progress begins. */
export function swipeDeadZoneDistance(cardWidth: number): number {
  const commit = swipeCommitDistance(cardWidth);
  return Math.min(commit * 0.45, cardWidth * SWIPE_DEAD_ZONE_RATIO);
}

/**
 * Map raw horizontal delta to 0-1 swipe progress.
 * Dead zone stays at 0; commit distance is 1.0.
 */
export function swipeProgressFromDelta(dx: number, cardWidth: number): number {
  const abs = Math.abs(dx);
  const dead = swipeDeadZoneDistance(cardWidth);
  const commit = swipeCommitDistance(cardWidth);
  if (abs <= dead || commit <= dead) return 0;
  return clamp01((abs - dead) / (commit - dead));
}

/** Swipe left (negative dx) → next (+1); swipe right → previous (−1). */
export function swipeDirectionFromDelta(dx: number): SwipeDirection {
  if (dx < 0) return 1;
  if (dx > 0) return -1;
  return 0;
}

export function canSwipeInDirection(
  index: number,
  stopCount: number,
  direction: SwipeDirection,
): boolean {
  if (direction === 0 || stopCount < 2 || index < 0) return false;
  const next = index + direction;
  return next >= 0 && next < stopCount;
}

/**
 * Apply rubber-band resistance when dragging past the first/last card.
 * Returns the visual translateX in pixels.
 */
export function swipeVisualOffset(
  dx: number,
  cardWidth: number,
  options: { canMove: boolean },
): number {
  if (!cardWidth) return 0;
  if (options.canMove) {
    // Follow the finger, capped slightly past commit so the exit feels continuous.
    const cap = swipeCommitDistance(cardWidth) * 1.15;
    if (dx > cap) return cap;
    if (dx < -cap) return -cap;
    return dx;
  }
  // Edge: resistance so the card still moves a little, then fights back.
  const resisted = dx * SWIPE_EDGE_RESISTANCE;
  const edgeCap = cardWidth * 0.18;
  if (resisted > edgeCap) return edgeCap;
  if (resisted < -edgeCap) return -edgeCap;
  return resisted;
}

export function shouldCommitSwipe(progress: number): boolean {
  return progress >= 1;
}

export function lockSwipeAxis(
  dx: number,
  dy: number,
  lockPx: number = SWIPE_AXIS_LOCK_PX,
): 'h' | 'v' | null {
  if (Math.abs(dx) < lockPx && Math.abs(dy) < lockPx) return null;
  // Prefer clear horizontal intent on the card surface (Android-friendly).
  if (Math.abs(dx) > Math.abs(dy) * 1.1) return 'h';
  if (Math.abs(dy) > Math.abs(dx)) return 'v';
  return null;
}

/** Only a gesture with visible travel should suppress the trailing tap. */
export function gestureSuppressesTap(dx: number, cardWidth: number): boolean {
  return Math.abs(dx) > swipeDeadZoneDistance(cardWidth);
}
