import type {
  DeliveryJob,
  DeliveryLineItem,
  DeliveryRun,
  DeliveryRunPhase,
  DeliveryRunStop,
} from '../../../types/pos.types';
import {
  normalizeWizardPhase,
  stopLineItems,
} from './driverWizardUtils';

export type DayBoardStage =
  | 'initial'
  | 'calls'
  | 'route'
  | 'load'
  | 'active'
  | 'return'
  | 'completed';

export type DeliveryDayCardModel = {
  key: string;
  job: DeliveryJob;
  stop: DeliveryRunStop | null;
  order: number;
  customer_name: string;
  phone: string;
  address: string;
  original_address: string;
  address_corrected: boolean;
  notes: string;
  item_count: number;
  items_delivered: string;
  line_items: DeliveryLineItem[];
  fee: string;
  job_status: DeliveryJob['status'];
  stop_state: DeliveryRunStop['state'] | null;
  is_confirmed: boolean;
  has_call_result: boolean;
  eta_arrive_at: string | null;
  eta_window_end_at: string | null;
  drive_seconds_from_prev: number | null;
  loaded: boolean;
  secured: boolean;
  is_next_up: boolean;
  needs_reconcile: boolean;
  group: 'actionable' | 'excluded' | 'hold' | 'completed' | 'rescheduled';
};

export function resolveDayBoardStage(run: DeliveryRun | null | undefined): DayBoardStage {
  if (!run) return 'initial';
  if (run.status === 'completed') return 'completed';
  const phase = normalizeWizardPhase(run.phase);
  if (phase === 'return') return 'return';
  if (phase === 'active') return 'active';
  if (phase === 'load') return 'load';
  if (phase === 'route') return 'route';
  if (phase === 'calls') return 'calls';
  return 'initial';
}

export function stageLabel(stage: DayBoardStage): string {
  switch (stage) {
    case 'initial':
      return 'Not started';
    case 'calls':
      return 'Make calls';
    case 'route':
      return 'Optimize route';
    case 'load':
      return 'Load truck';
    case 'active':
      return 'Delivering';
    case 'return':
      return 'Return & reconcile';
    case 'completed':
      return 'Day complete';
    default:
      return stage;
  }
}

export function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export function jobStopAddress(job: DeliveryJob): string {
  const base = (job.address || '').trim();
  if (!base) return '';
  if (job.is_apt && job.unit) return `${base}, Unit ${job.unit}`;
  return base;
}

function cardGroup(
  stage: DayBoardStage,
  stop: DeliveryRunStop | null,
  job: DeliveryJob,
): DeliveryDayCardModel['group'] {
  if (stop?.state === 'rescheduled') return 'rescheduled';
  if (job.status === 'cancelled' || stop?.state === 'failed') {
    if (stop && !stop.return_reconciled_at && stage === 'return') return 'hold';
    return 'completed';
  }
  if (stop?.state === 'completed' || job.status === 'completed') return 'completed';
  if (stop?.state === 'on_hold') return 'hold';
  if (stage === 'route' || stage === 'load' || stage === 'active') {
    if (stop && !stop.is_confirmed) return 'excluded';
  }
  // Remaining open stops on return (queued / next_up) need reconciliation.
  if (stage === 'return' && stop && !stop.return_reconciled_at) {
    return 'hold';
  }
  return 'actionable';
}

/** Merge jobs with optional run stops into stable day-board cards. */
export function buildDeliveryDayCards(
  jobs: DeliveryJob[],
  run: DeliveryRun | null | undefined,
): DeliveryDayCardModel[] {
  const stage = resolveDayBoardStage(run);
  const stops = run?.stops ?? [];
  const stopByJob = new Map(stops.map((s) => [s.job_id, s]));

  const scheduledJobs = jobs.filter((j) => j.scheduled_date);
  const cards: DeliveryDayCardModel[] = scheduledJobs.map((job) => {
    const stop = stopByJob.get(job.id) ?? null;
    const lineItems = stop ? stopLineItems(stop) : [];
    const textParts = String(job.items_delivered || '')
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const items =
      lineItems.length > 0
        ? lineItems
        : (textParts.length > 0 ? textParts : [job.items_delivered || 'Delivery items']).map(
            (description) => ({
              line_id: null as number | null,
              sku: '',
              description,
              quantity: 1,
              scannable: false,
              scan_verified: false,
            }),
          );
    const itemCount =
      items.reduce((n, it) => n + (it.quantity || 1), 0) || job.item_count || 1;
    const originalAddress =
      stop?.original_address || job.original_address || jobStopAddress(job);
    const currentAddress =
      stop?.address || job.delivery_address || jobStopAddress(job);
    const addressCorrected =
      Boolean(job.address_corrected) ||
      Boolean(
        stop &&
          stop.original_address &&
          stop.address &&
          stop.original_address.trim() !== stop.address.trim(),
      ) ||
      (stop?.address_revisions || []).some((r) => r.is_active);

    return {
      key: `job-${job.id}`,
      job,
      stop,
      order: stop?.position ?? job.id,
      customer_name: stop?.customer_name || job.customer_name,
      phone: stop?.phone || job.phone,
      address: currentAddress,
      original_address: originalAddress,
      address_corrected: addressCorrected,
      notes: stop?.notes ?? job.notes ?? '',
      item_count: itemCount,
      items_delivered: stop?.items_delivered || job.items_delivered,
      line_items: items,
      fee: job.fee,
      job_status: job.status,
      stop_state: stop?.state ?? null,
      is_confirmed: Boolean(stop?.is_confirmed),
      has_call_result: Boolean(stop?.has_call_result),
      eta_arrive_at: stop?.eta_arrive_at ?? null,
      eta_window_end_at: stop?.eta_window_end_at ?? null,
      drive_seconds_from_prev: stop?.drive_seconds_from_prev ?? null,
      loaded: Boolean(stop?.loaded_at),
      secured: Boolean(stop?.secured_at),
      is_next_up: stop?.state === 'next_up',
      needs_reconcile: Boolean(
        stop &&
          stop.state !== 'completed' &&
          stop.state !== 'rescheduled' &&
          !stop.return_reconciled_at,
      ),
      group: cardGroup(stage, stop, job),
    };
  });

  // Prefer run stop order when a run exists
  if (run) {
    cards.sort((a, b) => {
      const ga = groupSortRank(a.group, stage);
      const gb = groupSortRank(b.group, stage);
      if (ga !== gb) return ga - gb;
      if (a.is_next_up !== b.is_next_up) return a.is_next_up ? -1 : 1;
      return a.order - b.order || a.job.id - b.job.id;
    });
  } else {
    cards.sort((a, b) => a.job.id - b.job.id);
  }

  return cards;
}

function groupSortRank(group: DeliveryDayCardModel['group'], stage: DayBoardStage): number {
  if (stage === 'return') {
    if (group === 'hold') return 0;
    if (group === 'actionable') return 1;
    if (group === 'excluded') return 2;
    if (group === 'rescheduled') return 3;
    return 4;
  }
  if (group === 'actionable') return 0;
  if (group === 'excluded') return 1;
  if (group === 'hold') return 2;
  if (group === 'rescheduled') return 3;
  return 4;
}

export function boardPrimaryAction(
  stage: DayBoardStage,
  run: DeliveryRun | null | undefined,
): { label: string; action: string; disabled: boolean; disabledReason?: string } | null {
  if (stage === 'initial') {
    return { label: 'Start delivery day', action: 'start', disabled: false };
  }
  if (!run || stage === 'completed') return null;
  if (stage === 'calls') {
    const ok = Boolean(run.all_stops_called);
    return {
      label: ok ? 'Continue to route' : 'Record a call for every stop',
      action: 'to_route',
      disabled: !ok,
      disabledReason: ok ? undefined : 'Every stop needs a call result',
    };
  }
  if (stage === 'route') {
    const confirmed = (run.progress?.confirmed ?? 0) > 0 || run.stops.some((s) => s.is_confirmed);
    return {
      label: 'Continue to load',
      action: 'to_load',
      disabled: !confirmed,
      disabledReason: confirmed ? undefined : 'Confirm at least one stop',
    };
  }
  if (stage === 'load') {
    const ok = Boolean(run.all_loaded_secured) && (run.truck_photo_count || 0) >= 1;
    return {
      label: ok ? 'Start drive' : 'Load, secure, and add truck photo',
      action: 'begin_drive',
      disabled: !ok,
    };
  }
  if (stage === 'active') {
    const hasNext = Boolean(run.next_up?.is_confirmed);
    if (!hasNext) {
      return { label: 'Return to store', action: 'return_store', disabled: false };
    }
    return null;
  }
  if (stage === 'return') {
    const ok = Boolean(run.can_finish);
    return {
      label: ok ? 'End day' : 'Reconcile undelivered stops',
      action: 'finish',
      disabled: !ok,
    };
  }
  return null;
}

export function phaseProgress(stage: DayBoardStage): { key: DayBoardStage; label: string }[] {
  return [
    { key: 'calls', label: 'Calls' },
    { key: 'route', label: 'Route' },
    { key: 'load', label: 'Load' },
    { key: 'active', label: 'Drive' },
    { key: 'return', label: 'Return' },
  ];
}

export function isStageReached(current: DayBoardStage, step: DayBoardStage): boolean {
  const order: DayBoardStage[] = ['initial', 'calls', 'route', 'load', 'active', 'return', 'completed'];
  return order.indexOf(current) >= order.indexOf(step);
}

export type { DeliveryRunPhase };
