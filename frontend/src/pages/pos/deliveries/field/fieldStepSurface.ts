import type { DeliveryRun, DeliveryRunStop } from '../../../../types/pos.types';

/**
 * Local UI surface for each wizard step.
 * - work: incomplete step (action cards / scanners)
 * - summary: completed enough to continue; sticky final action
 * - edit: reopen action cards from summary without rolling back server phase
 */
export type FieldStepSurface = 'work' | 'summary' | 'edit';

export type FieldUiStepKind = 'contact' | 'load' | 'routes' | 'deliveries' | 'finish';

export type StepCompletionMode = 'action' | 'reopen' | 'locked';

export type StepCompletionControl = {
  mode: StepCompletionMode;
  label: string;
};

export function resolveStepSurface(opts: {
  workComplete: boolean;
  editing: boolean;
}): FieldStepSurface {
  if (!opts.workComplete) return 'work';
  if (opts.editing) return 'edit';
  return 'summary';
}

/** True when the run's allowed_actions includes this action string. */
export function runAllowsAction(
  allowed: string[] | undefined | null,
  action: string,
): boolean {
  if (!allowed?.length) return false;
  return allowed.includes(action) || allowed.some((a) => a.startsWith(`${action}:`));
}

function normalizePhase(phase: string | undefined | null): string {
  return (phase || '').toLowerCase();
}

/** Any load/scan activity after Contact - blocks Reopen Contact. */
export function hasLoadDownstreamActivity(run: DeliveryRun): boolean {
  if (run.truck_closed || run.truck_closed_at) return true;
  const phase = normalizePhase(run.phase);
  if (['truck', 'route', 'active', 'return'].includes(phase)) return true;
  if (run.status === 'en_route' || run.status === 'completed') return true;
  return (run.stops ?? []).some((stop) => {
    if (stop.loaded_at) return true;
    if ((stop.items_ready_count ?? 0) > 0) return true;
    return (stop.stop_items ?? []).some(
      (item) => Boolean(item.loaded_at) || Boolean(item.is_ready) || (item.scans?.length ?? 0) > 0,
    );
  });
}

/** Route departure or later - blocks Reopen Load / mutating sealed truck. */
export function hasRouteDownstreamActivity(run: DeliveryRun): boolean {
  const phase = normalizePhase(run.phase);
  if (['active', 'return'].includes(phase)) return true;
  if (run.status === 'en_route' || run.status === 'completed') return true;
  return (run.stops ?? []).some(
    (stop) =>
      Boolean(stop.contact_present_at) ||
      Boolean(stop.delivered_at) ||
      Boolean(stop.completed_at) ||
      stop.state === 'completed',
  );
}

/** Store return or finish - blocks Reopen Deliveries as a transition undo. */
export function hasFinishDownstreamActivity(run: DeliveryRun): boolean {
  if (run.returned_to_store_at) return true;
  if (run.status === 'completed') return true;
  return normalizePhase(run.phase) === 'return';
}

export function resolveStepCompletionControl(opts: {
  step: FieldUiStepKind;
  run: DeliveryRun;
  workComplete: boolean;
  editing?: boolean;
  canMutate?: boolean;
}): StepCompletionControl {
  const { step, run, workComplete, editing = false, canMutate = true } = opts;
  const phase = normalizePhase(run.phase);

  if (step === 'contact') {
    if (!workComplete || editing) {
      return { mode: 'action', label: 'Complete Contact' };
    }
    if (hasLoadDownstreamActivity(run)) {
      return { mode: 'locked', label: 'Contact complete' };
    }
    // Still on calls, or advanced to load with no load work yet.
    if (phase === 'calls' || phase === 'start' || !phase) {
      return { mode: 'action', label: 'Complete Contact' };
    }
    return { mode: 'reopen', label: 'Reopen Contact' };
  }

  if (step === 'load') {
    if (hasRouteDownstreamActivity(run) || run.status === 'completed') {
      return { mode: 'locked', label: 'Load complete' };
    }
    if (run.truck_closed || run.truck_closed_at || phase === 'route') {
      // Sealed: server reopen is a separate button. Local reopen stays local.
      if (canMutate && !editing) {
        return { mode: 'reopen', label: 'Reopen Load' };
      }
      return { mode: 'locked', label: 'Load complete' };
    }
    return {
      mode: 'action',
      label: run.truck_reopened_at ? 'Reseal Truck' : 'Seal Truck',
    };
  }

  if (step === 'routes') {
    if (hasRouteDownstreamActivity(run) && (phase === 'active' || phase === 'return')) {
      return { mode: 'locked', label: 'Routes complete' };
    }
    if (phase === 'active' || phase === 'return' || run.status === 'en_route') {
      return { mode: 'locked', label: 'Routes complete' };
    }
    if (editing) {
      return { mode: 'action', label: 'Start Deliveries' };
    }
    if (canMutate && workComplete) {
      // Summary: primary commits; card/list interaction handles local reopen.
      return { mode: 'action', label: 'Start Deliveries' };
    }
    return { mode: 'action', label: 'Start Deliveries' };
  }

  if (step === 'deliveries') {
    if (run.status === 'completed' || phase === 'return' || run.returned_to_store_at) {
      return { mode: 'locked', label: 'Deliveries complete' };
    }
    if (!workComplete || editing) {
      return { mode: 'action', label: 'Back at Store' };
    }
    return { mode: 'action', label: 'Back at Store' };
  }

  // finish
  if (run.status === 'completed') {
    return { mode: 'locked', label: 'Day complete' };
  }
  if (!run.returned_to_store_at) {
    return { mode: 'action', label: 'Back at Store' };
  }
  return { mode: 'action', label: 'End Day' };
}

/** Whether a summary card may open a mutable action surface. */
export function cardAllowsMutation(
  allowed: string[] | undefined | null,
  actions: string[],
): boolean {
  return actions.some((action) => runAllowsAction(allowed, action));
}

/** Photos that count for the current seal / reseal attempt. */
export function sealWindowPhotoCount(run: DeliveryRun): number {
  return run.truck_seal_photo_count ?? run.truck_photo_count ?? 0;
}

/** Load side of the seal gate: items ready, photo not considered. */
export function truckLoadReadyToSeal(run: DeliveryRun): boolean {
  if (run.truck_closed || run.truck_closed_at) return false;
  if (run.departure_override) return true;
  const load = run.monitor?.load;
  if (load) return Boolean(load.can_close_truck);
  // Phase truck always advertises close_truck - only fall back when monitor is missing.
  return runAllowsAction(run.allowed_actions, 'close_truck');
}

/**
 * Client seal gate must match the server close_truck action.
 * Requires a truck photo in the current seal window and server readiness.
 * Do not use local on-truck row counts - they can disagree with partial-load rules.
 */
export function canSealTruckFromRun(run: DeliveryRun): boolean {
  if (run.truck_closed || run.truck_closed_at) return false;
  if (sealWindowPhotoCount(run) < 1) return false;
  if (runAllowsAction(run.allowed_actions, 'close_truck')) return true;
  if (run.departure_override) return true;
  return Boolean(run.monitor?.load?.can_close_truck);
}

/** Server-authoritative Start Deliveries gate. */
export function canBeginRouteFromRun(run: DeliveryRun): boolean {
  return runAllowsAction(run.allowed_actions, 'begin_route');
}

/** Whether the driver may unseal to load more before departure. */
export function canReopenTruckFromRun(run: DeliveryRun): boolean {
  return runAllowsAction(run.allowed_actions, 'reopen_truck');
}

/** Human reasons Seal Truck stays disabled (for snackbars / secondary copy). */
export function sealTruckBlockers(run: DeliveryRun): string[] {
  if (run.truck_closed || run.truck_closed_at) return [];
  const blockers: string[] = [];
  const load = run.monitor?.load;
  // Prefer load blockers first - camera-first Seal opens the camera when items are ready.
  if (!truckLoadReadyToSeal(run)) {
    if (load && load.ready > 0 && load.ready < load.total_items && !load.all_ready) {
      blockers.push('Finish or unload partially loaded deliveries');
    } else {
      blockers.push('Load at least one full delivery onto the truck');
    }
  }
  if (sealWindowPhotoCount(run) < 1) {
    blockers.push(
      run.truck_reopened_at
        ? 'Add a new closed-door truck photo to reseal'
        : 'Add a closed-door truck photo',
    );
  }
  return blockers;
}

export function stopLooksLoaded(stop: DeliveryRunStop): boolean {
  if (stop.loaded_at) return true;
  const items = stop.stop_items ?? [];
  if (!items.length) return Boolean(stop.loaded_at);
  return items.every((item) => Boolean(item.loaded_at) || Boolean(item.is_ready));
}
