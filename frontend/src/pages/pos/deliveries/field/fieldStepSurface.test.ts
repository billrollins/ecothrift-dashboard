import { describe, expect, it } from 'vitest';
import type { DeliveryRun } from '../../../../types/pos.types';
import {
  canBeginRouteFromRun,
  canReopenTruckFromRun,
  canSealTruckFromRun,
  hasLoadDownstreamActivity,
  hasRouteDownstreamActivity,
  resolveStepCompletionControl,
  resolveStepSurface,
  runAllowsAction,
  sealTruckBlockers,
  sealWindowPhotoCount,
  truckLoadReadyToSeal,
} from './fieldStepSurface';

function run(partial: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 1,
    date: '2026-07-24',
    availability_id: null,
    status: 'in_progress',
    phase: 'calls',
    started_at: null,
    ended_at: null,
    started_by: '',
    elapsed_seconds: 0,
    route_revision: 0,
    last_optimized_at: null,
    maps_url: '',
    notes: '',
    returned_to_store_at: null,
    truck_photos: [],
    truck_photo_count: 0,
    max_truck_photos: 4,
    all_loaded_secured: false,
    all_stops_called: false,
    can_finish: false,
    return_issue_codes: [],
    progress: { total: 0, completed: 0, on_hold: 0, queued: 0, failed: 0 },
    next_up: null,
    stops: [],
    ...partial,
  } as DeliveryRun;
}

describe('fieldStepSurface', () => {
  it('resolves work / summary / edit', () => {
    expect(resolveStepSurface({ workComplete: false, editing: false })).toBe('work');
    expect(resolveStepSurface({ workComplete: false, editing: true })).toBe('work');
    expect(resolveStepSurface({ workComplete: true, editing: false })).toBe('summary');
    expect(resolveStepSurface({ workComplete: true, editing: true })).toBe('edit');
  });

  it('checks allowed_actions', () => {
    expect(runAllowsAction(['load', 'close_truck'], 'close_truck')).toBe(true);
    expect(runAllowsAction(['set_phase:route'], 'set_phase')).toBe(true);
    expect(runAllowsAction(['load'], 'close_truck')).toBe(false);
    expect(runAllowsAction(undefined, 'load')).toBe(false);
  });

  it('detects load and route downstream activity', () => {
    expect(hasLoadDownstreamActivity(run({ phase: 'calls', stops: [] }))).toBe(false);
    expect(
      hasLoadDownstreamActivity(
        run({
          phase: 'load',
          stops: [{ loaded_at: '2026-07-24T12:00:00Z' } as never],
        }),
      ),
    ).toBe(true);
    expect(hasLoadDownstreamActivity(run({ truck_closed: true }))).toBe(true);
    expect(hasRouteDownstreamActivity(run({ phase: 'route' }))).toBe(false);
    expect(hasRouteDownstreamActivity(run({ phase: 'active', status: 'en_route' }))).toBe(true);
  });

  it('resolves contact completion / reopen / locked labels', () => {
    expect(
      resolveStepCompletionControl({
        step: 'contact',
        run: run({ phase: 'calls' }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'action', label: 'Complete Contact' });

    expect(
      resolveStepCompletionControl({
        step: 'contact',
        run: run({ phase: 'load', stops: [] }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'reopen', label: 'Reopen Contact' });

    expect(
      resolveStepCompletionControl({
        step: 'contact',
        run: run({
          phase: 'load',
          stops: [{ loaded_at: '2026-07-24T12:00:00Z' } as never],
        }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'locked', label: 'Contact complete' });
  });

  it('resolves load Seal Truck / Reseal Truck / Load complete', () => {
    expect(
      resolveStepCompletionControl({
        step: 'load',
        run: run({ phase: 'load', truck_closed: false }),
        workComplete: true,
        canMutate: true,
      }),
    ).toEqual({ mode: 'action', label: 'Seal Truck' });

    expect(
      resolveStepCompletionControl({
        step: 'load',
        run: run({
          phase: 'truck',
          truck_closed: false,
          truck_reopened_at: '2026-07-24T14:00:00Z',
        }),
        workComplete: true,
        canMutate: true,
      }),
    ).toEqual({ mode: 'action', label: 'Reseal Truck' });

    expect(
      resolveStepCompletionControl({
        step: 'load',
        run: run({ phase: 'active', truck_closed: true, status: 'en_route' }),
        workComplete: true,
        canMutate: false,
      }),
    ).toEqual({ mode: 'locked', label: 'Load complete' });
  });

  it('seals only when server allows close_truck (not local on-truck counts)', () => {
    const baseLoad = {
      total_items: 4,
      verified: 2,
      loaded: 2,
      photographed: 0,
      ready: 2,
      all_ready: false,
      can_close_truck: false,
    };
    expect(
      canSealTruckFromRun(
        run({
          phase: 'load',
          truck_photo_count: 1,
          allowed_actions: ['load', 'upload_truck_photo'],
          monitor: { load: baseLoad } as never,
        }),
      ),
    ).toBe(false);

    expect(
      canSealTruckFromRun(
        run({
          phase: 'load',
          truck_photo_count: 1,
          allowed_actions: ['load', 'upload_truck_photo', 'close_truck'],
          monitor: { load: { ...baseLoad, can_close_truck: true } } as never,
        }),
      ),
    ).toBe(true);

    expect(
      canSealTruckFromRun(
        run({
          phase: 'load',
          truck_photo_count: 0,
          allowed_actions: ['close_truck'],
          monitor: { load: { ...baseLoad, can_close_truck: true } } as never,
        }),
      ),
    ).toBe(false);

    expect(
      sealTruckBlockers(
        run({
          phase: 'load',
          truck_photo_count: 1,
          allowed_actions: ['load'],
          monitor: { load: baseLoad } as never,
        }),
      )[0],
    ).toMatch(/partially loaded|full delivery/i);
  });

  it('starts deliveries only when begin_route is allowed', () => {
    expect(canBeginRouteFromRun(run({ phase: 'route', allowed_actions: ['reorder'] }))).toBe(
      false,
    );
    expect(
      canBeginRouteFromRun(run({ phase: 'route', allowed_actions: ['reorder', 'begin_route'] })),
    ).toBe(true);
  });

  it('reopens truck only when reopen_truck is allowed', () => {
    expect(
      canReopenTruckFromRun(run({ phase: 'route', allowed_actions: ['reorder', 'begin_route'] })),
    ).toBe(false);
    expect(
      canReopenTruckFromRun(
        run({ phase: 'route', allowed_actions: ['reorder', 'reopen_truck'] }),
      ),
    ).toBe(true);
  });

  it('truckLoadReadyToSeal ignores missing seal-window photos', () => {
    const readyLoad = {
      total_items: 2,
      verified: 2,
      loaded: 2,
      photographed: 0,
      ready: 2,
      all_ready: true,
      can_close_truck: true,
    };
    expect(
      truckLoadReadyToSeal(
        run({
          phase: 'truck',
          truck_closed: false,
          truck_photo_count: 2,
          truck_seal_photo_count: 0,
          truck_reopened_at: '2026-07-24T14:00:00Z',
          allowed_actions: ['close_truck', 'load', 'upload_truck_photo'],
          monitor: { load: readyLoad } as never,
        }),
      ),
    ).toBe(true);

    expect(
      truckLoadReadyToSeal(
        run({
          phase: 'truck',
          truck_closed: false,
          truck_seal_photo_count: 0,
          allowed_actions: ['close_truck'],
          monitor: {
            load: { ...readyLoad, can_close_truck: false, ready: 1, all_ready: false },
          } as never,
        }),
      ),
    ).toBe(false);

    expect(
      truckLoadReadyToSeal(
        run({
          phase: 'truck',
          truck_closed_at: '2026-07-24T14:00:00Z',
          truck_closed: true,
          monitor: { load: readyLoad } as never,
        }),
      ),
    ).toBe(false);
  });

  it('uses seal-window photo count after reopen (old photos do not enable reseal)', () => {
    expect(
      sealWindowPhotoCount(
        run({
          truck_photo_count: 2,
          truck_seal_photo_count: 0,
          truck_reopened_at: '2026-07-24T14:00:00Z',
        }),
      ),
    ).toBe(0);

    expect(
      canSealTruckFromRun(
        run({
          phase: 'truck',
          truck_closed: false,
          truck_photo_count: 2,
          truck_seal_photo_count: 0,
          truck_reopened_at: '2026-07-24T14:00:00Z',
          allowed_actions: ['close_truck', 'load', 'upload_truck_photo'],
          monitor: {
            load: {
              total_items: 2,
              verified: 2,
              loaded: 2,
              photographed: 0,
              ready: 2,
              all_ready: true,
              can_close_truck: true,
            },
          } as never,
        }),
      ),
    ).toBe(false);

    expect(
      sealTruckBlockers(
        run({
          phase: 'truck',
          truck_closed: false,
          truck_photo_count: 2,
          truck_seal_photo_count: 0,
          truck_reopened_at: '2026-07-24T14:00:00Z',
          allowed_actions: ['close_truck'],
        }),
      )[0],
    ).toMatch(/new closed-door truck photo/i);

    expect(
      canSealTruckFromRun(
        run({
          phase: 'truck',
          truck_closed: false,
          truck_photo_count: 2,
          truck_seal_photo_count: 1,
          truck_reopened_at: '2026-07-24T14:00:00Z',
          allowed_actions: ['close_truck', 'load', 'upload_truck_photo'],
          monitor: {
            load: {
              total_items: 2,
              verified: 2,
              loaded: 2,
              photographed: 0,
              ready: 2,
              all_ready: true,
              can_close_truck: true,
            },
          } as never,
        }),
      ),
    ).toBe(true);
  });

  it('resolves routes and deliveries transition labels', () => {
    expect(
      resolveStepCompletionControl({
        step: 'routes',
        run: run({ phase: 'route' }),
        workComplete: true,
        canMutate: true,
      }),
    ).toEqual({ mode: 'action', label: 'Start Deliveries' });

    expect(
      resolveStepCompletionControl({
        step: 'routes',
        run: run({ phase: 'active', status: 'en_route' }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'locked', label: 'Routes complete' });

    expect(
      resolveStepCompletionControl({
        step: 'deliveries',
        run: run({ phase: 'active', status: 'en_route' }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'action', label: 'Back at Store' });

    expect(
      resolveStepCompletionControl({
        step: 'deliveries',
        run: run({
          phase: 'return',
          returned_to_store_at: '2026-07-24T18:00:00Z',
        }),
        workComplete: true,
      }),
    ).toEqual({ mode: 'locked', label: 'Deliveries complete' });
  });
});
