import type {
  DeliveryDayDetail,
  DeliveryRun,
  DeliveryRunPhase,
  DeliveryRunStop,
  DeliveryStopItem,
} from '../../../../types/pos.types';

export type FieldStage =
  | 'planned'
  | 'calls'
  | 'load'
  | 'truck'
  | 'route'
  | 'active'
  | 'return'
  | 'completed'
  | 'readonly';

export const FIELD_PHASE_ORDER: DeliveryRunPhase[] = [
  'calls',
  'load',
  'truck',
  'route',
  'active',
  'return',
];

export function normalizeFieldPhase(phase: DeliveryRunPhase | string | undefined): DeliveryRunPhase {
  if (!phase || phase === 'start') return 'calls';
  if (phase === 'review') return 'calls';
  return phase as DeliveryRunPhase;
}

export function resolveFieldStage(
  day: DeliveryDayDetail,
  run: DeliveryRun | null | undefined,
  inactiveReview: boolean,
): FieldStage {
  if (day.display_state === 'completed' || run?.status === 'completed') return 'completed';
  if (day.display_state === 'planned' && !run) {
    return inactiveReview ? 'readonly' : 'planned';
  }
  if (day.display_state === 'cancelled' || day.display_state === 'not_run') return 'readonly';
  if (!run) return 'readonly';
  if (inactiveReview && day.display_state !== 'active') return 'readonly';
  return normalizeFieldPhase(run.phase) as FieldStage;
}

export function fieldStageLabel(stage: FieldStage): string {
  switch (stage) {
    case 'planned':
      return 'Planned today';
    case 'calls':
      return 'Contact customers';
    case 'load':
      return 'Load items';
    case 'truck':
      return 'Close truck';
    case 'route':
      return 'Review route';
    case 'active':
      return 'Drive & deliver';
    case 'return':
      return 'Return & finish';
    case 'completed':
      return 'Day complete';
    case 'readonly':
      return 'Review';
    default:
      return stage;
  }
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function liveElapsedSeconds(run: DeliveryRun | null | undefined, tick: number): number {
  if (!run) return 0;
  if (run.status === 'completed') return run.elapsed_seconds ?? 0;
  if (run.started_at) {
    const started = Date.parse(run.started_at);
    if (Number.isFinite(started)) {
      void tick;
      return Math.max(run.elapsed_seconds ?? 0, Math.floor((Date.now() - started) / 1000));
    }
  }
  return run.elapsed_seconds ?? 0;
}

export interface FlattenedStopItem {
  item: DeliveryStopItem;
  stop: DeliveryRunStop;
}

export function flattenStopItemsQueue(run: DeliveryRun): FlattenedStopItem[] {
  const rows: FlattenedStopItem[] = [];
  for (const stop of run.stops ?? []) {
    for (const item of stop.stop_items ?? []) {
      rows.push({ item, stop });
    }
  }
  return rows.sort((a, b) => {
    const pos = a.stop.position - b.stop.position;
    if (pos !== 0) return pos;
    return a.item.position - b.item.position;
  });
}

export function nextIncompleteLoadItem(run: DeliveryRun): FlattenedStopItem | null {
  return flattenStopItemsQueue(run).find(({ item }) => !item.is_ready) ?? null;
}

export function unconfirmedStops(run: DeliveryRun): DeliveryRunStop[] {
  return (run.stops ?? []).filter(
    (s) =>
      !s.is_confirmed &&
      !s.excluded_unconfirmed &&
      s.state !== 'completed' &&
      s.state !== 'failed' &&
      s.state !== 'rescheduled',
  );
}

export function confirmedStops(run: DeliveryRun): DeliveryRunStop[] {
  return (run.stops ?? []).filter((s) => s.is_confirmed);
}

export function currentDriveStop(run: DeliveryRun): DeliveryRunStop | null {
  return (
    run.monitor?.current_stop ??
    run.next_up ??
    (run.stops ?? []).find((s) => s.state === 'next_up') ??
    null
  );
}

export function mapsNavigateUrl(address: string): string {
  const q = encodeURIComponent(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export function smsComposerUrl(phone: string, body: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export interface FieldPrimaryAction {
  label: string;
  action: string;
  disabled?: boolean;
}

export function fieldPrimaryAction(run: DeliveryRun | null | undefined): FieldPrimaryAction | null {
  if (!run || run.status === 'completed') return null;
  const next = run.next_action;
  const allowed = new Set(run.allowed_actions ?? []);
  const phase = normalizeFieldPhase(run.phase);

  if (next === 'call') {
    return { label: 'Record contact', action: 'contact' };
  }
  if (next === 'set_phase:load' && allowed.has('set_phase:load')) {
    return { label: 'Start loading', action: 'set_phase:load' };
  }
  if (next === 'load' || phase === 'load') {
    const item = nextIncompleteLoadItem(run);
    if (item) return { label: 'Continue loading', action: 'load_item' };
    if (allowed.has('set_phase:truck')) return { label: 'Close truck prep', action: 'set_phase:truck' };
  }
  if (next === 'upload_truck_photo') {
    return { label: 'Take truck photo', action: 'upload_truck_photo' };
  }
  if (next === 'close_truck') {
    return { label: 'Close truck', action: 'close_truck' };
  }
  if (next === 'set_phase:route' && allowed.has('set_phase:route')) {
    return { label: 'Review route', action: 'set_phase:route' };
  }
  if (next === 'disposition') {
    return { label: 'Resolve contacts', action: 'disposition' };
  }
  if (next === 'begin_route' && allowed.has('begin_route')) {
    return { label: 'Start route', action: 'begin_route' };
  }
  if (next === 'contact_present') return { label: 'Customer present', action: 'contact_present' };
  if (next === 'delivered') return { label: 'Mark delivered', action: 'delivered' };
  if (next === 'upload_proof') return { label: 'Add proof photo', action: 'upload_proof' };
  if (next === 'complete') return { label: 'Complete stop', action: 'complete' };
  if (next === 'return_store') return { label: 'Returned to store', action: 'return_store' };
  if (next === 'return_reconcile') return { label: 'Reconcile return', action: 'return_reconcile' };
  if (next === 'finish' && allowed.has('finish')) return { label: 'Finish day', action: 'finish' };
  return null;
}

export function hasDirtyFieldState(params: {
  pendingUploads: number;
  draftNote: string;
  draftSku: string;
}): boolean {
  return params.pendingUploads > 0 || Boolean(params.draftNote.trim()) || Boolean(params.draftSku.trim());
}

export function confirmLeaveDirty(message = 'You have unsaved work. Leave anyway?'): boolean {
  return window.confirm(message);
}

export const DISPOSITION_LABELS: Record<string, string> = {
  awaiting_reply: 'Awaiting reply',
  confirmed: 'Confirmed',
  reschedule_requested: 'Reschedule requested',
  cancel_requested: 'Cancel requested',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  wrong_number: 'Wrong number',
  other: 'Other',
};
