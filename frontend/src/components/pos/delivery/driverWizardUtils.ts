import type {
  DeliveryCallResult,
  DeliveryLineItem,
  DeliveryRun,
  DeliveryRunPhase,
  DeliveryRunStop,
} from '../../../types/pos.types';

export const WIZARD_PHASES: { key: DeliveryRunPhase; label: string }[] = [
  { key: 'calls', label: '1. Calls' },
  { key: 'route', label: '2. Route' },
  { key: 'load', label: '3. Load' },
  { key: 'active', label: '4. Drive' },
  { key: 'return', label: '5. Return' },
];

export const CALL_RESULT_OPTIONS: { value: DeliveryCallResult; label: string; chip: string }[] = [
  { value: 'answered_will_be_there', label: 'Will be there', chip: 'Confirmed' },
  { value: 'answered_not_available', label: 'Not available', chip: 'Call again' },
  { value: 'no_answer', label: 'No answer', chip: 'Call again' },
  { value: 'voicemail_left', label: 'Voicemail', chip: 'Call again' },
  { value: 'text_sent', label: 'Text sent', chip: 'Call again' },
  { value: 'wrong_number', label: 'Wrong number', chip: 'Unavailable' },
  { value: 'other', label: 'Other', chip: 'Call again' },
];

/** Map legacy / start phases onto the five-step flow. */
export function normalizeWizardPhase(phase: DeliveryRunPhase | string | undefined): DeliveryRunPhase {
  if (!phase || phase === 'start') return 'calls';
  if (phase === 'review') return 'calls';
  if (phase === 'truck') return 'load';
  return phase as DeliveryRunPhase;
}

export function stopLineItems(stop: DeliveryRunStop): DeliveryLineItem[] {
  if (Array.isArray(stop.line_items) && stop.line_items.length > 0) return stop.line_items;
  const parts = String(stop.items_delivered || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (parts.length ? parts : ['Delivery items']).map((description) => ({
    line_id: null,
    sku: '',
    description,
    quantity: 1,
    scannable: false,
    scan_verified: false,
  }));
}

export function confirmationChip(stop: Pick<DeliveryRunStop, 'is_confirmed' | 'latest_call_result' | 'has_call_result'>): {
  label: string;
  color: 'success' | 'warning' | 'default' | 'error';
} {
  if (stop.is_confirmed) return { label: 'Confirmed', color: 'success' };
  if (!stop.has_call_result) return { label: 'Needs call', color: 'warning' };
  if (stop.latest_call_result === 'wrong_number') return { label: 'Unavailable', color: 'error' };
  return { label: 'Call again', color: 'warning' };
}

export function canProceedFromCalls(run: Pick<DeliveryRun, 'all_stops_called'>): boolean {
  return Boolean(run.all_stops_called);
}

/** Gate: all confirmed stops loaded + secured. */
export function canProceedFromLoad(run: Pick<DeliveryRun, 'all_loaded_secured'>): boolean {
  return Boolean(run.all_loaded_secured);
}

/** Gate: at least one truck photo before departure. */
export function canProceedFromTruck(run: Pick<DeliveryRun, 'truck_photo_count'>): boolean {
  return (run.truck_photo_count || 0) >= 1;
}

export function canBeginDriving(run: Pick<DeliveryRun, 'all_loaded_secured' | 'truck_photo_count'>): boolean {
  return canProceedFromLoad(run) && canProceedFromTruck(run);
}

/** Normal completion requires contact + delivered + proof + signature. */
export function canCompleteStopNormally(
  stop: Pick<
    DeliveryRunStop,
    'has_proof_photo' | 'has_signature' | 'contact_present_at' | 'delivered_at'
  >,
): boolean {
  return Boolean(
    stop.contact_present_at &&
      stop.delivered_at &&
      stop.has_proof_photo &&
      stop.has_signature,
  );
}

export function confirmedStops(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((s) => s.is_confirmed);
}

export function unconfirmedStops(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((s) => !s.is_confirmed);
}

export function groupStopsByBoard(stops: DeliveryRunStop[]): {
  nextUp: DeliveryRunStop[];
  onHold: DeliveryRunStop[];
  completed: DeliveryRunStop[];
  queued: DeliveryRunStop[];
  failed: DeliveryRunStop[];
} {
  return {
    nextUp: stops.filter((s) => s.state === 'next_up' && s.is_confirmed),
    onHold: stops.filter((s) => s.state === 'on_hold' || (!s.is_confirmed && s.state !== 'completed' && s.state !== 'failed')),
    completed: stops.filter((s) => s.state === 'completed'),
    queued: stops.filter((s) => s.state === 'queued' && s.is_confirmed),
    failed: stops.filter((s) => s.state === 'failed'),
  };
}

export function stopsNeedingReconcile(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((s) => s.state !== 'completed' && !s.return_reconciled_at);
}

export function canFinishDay(run: Pick<DeliveryRun, 'can_finish' | 'returned_to_store_at'>): boolean {
  return Boolean(run.can_finish && run.returned_to_store_at);
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function interpolateTemplateTokens(
  body: string,
  vars: { name?: string; eta?: string; date?: string },
): string {
  let out = body;
  if (vars.name) out = out.replaceAll('{name}', vars.name);
  if (vars.eta) out = out.replaceAll('{eta}', vars.eta);
  if (vars.date) out = out.replaceAll('{date}', vars.date);
  return out;
}
