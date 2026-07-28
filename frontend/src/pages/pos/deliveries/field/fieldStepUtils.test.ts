import { describe, expect, it } from 'vitest';
import type { DeliveryRun, DeliveryRunStop } from '../../../../types/pos.types';
import {
  canSwipeInDirection,
  clampSelectedStopId,
  contactStopTone,
  contactWorkComplete,
  defaultSelectedStopId,
  deliveryStopTone,
  hasContactOutcome,
  isContactTerminal,
  isBehindLiveStep,
  isExcludedFromLoad,
  isOnRoute,
  isUiStepUnlocked,
  resolveUiStepSync,
  loadStopTone,
  gestureSuppressesTap,
  lockSwipeAxis,
  nextPendingStopId,
  compactStopItemSummary,
  partitionLoadBoardStops,
  routeInclusionTone,
  stopItemCountLabel,
  shouldCommitSwipe,
  stopIsOnTruck,
  stopNeedsScanBeforeLoad,
  stopsForUiStep,
  swipeCommitDistance,
  swipeDeadZoneDistance,
  swipeDirectionFromDelta,
  swipeProgressFromDelta,
  swipeVisualOffset,
  uiStepFromPhase,
  unlockedUiSteps,
} from './fieldStepUtils';

function stop(partial: Partial<DeliveryRunStop> & { id: number }): DeliveryRunStop {
  return {
    job_id: partial.id,
    position: 0,
    state: 'queued',
    customer_name: 'Test',
    phone: '4025550100',
    original_address: '1 Main',
    address: '1 Main',
    is_apt: false,
    unit: '',
    items_delivered: 'Item',
    item_count: 1,
    line_items: [],
    scan_verified: [],
    scan_verified_count: 0,
    scannable_count: 0,
    notes: '',
    job_status: 'scheduled',
    loaded_at: null,
    secured_at: null,
    contact_present_at: null,
    delivered_at: null,
    eta_arrive_at: null,
    eta_window_end_at: null,
    drive_seconds_from_prev: null,
    completed_at: null,
    proof_override: false,
    proof_override_reason: '',
    hold_reason: '',
    has_proof_photo: false,
    has_signature: false,
    latest_call_result: null,
    latest_call_at: null,
    latest_call_note: '',
    is_confirmed: false,
    needs_call_again: true,
    has_call_result: false,
    returned_unloaded_at: null,
    returned_items_stored_at: null,
    return_issue_code: '',
    return_issue_notes: '',
    return_reconciled_at: null,
    rescheduled_at: null,
    rescheduled_to_date: null,
    call_attempts: [],
    attachments: [],
    address_revisions: [],
    text_templates: [],
    stop_items: [],
    ...partial,
  };
}

function run(partial: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 1,
    date: '2026-07-22',
    availability_id: 9,
    status: 'preparing',
    phase: 'calls',
    started_at: '2026-07-22T12:00:00Z',
    ended_at: null,
    started_by: 'Driver',
    crew: [],
    truck_closed_at: null,
    truck_closed: false,
    departed_at: null,
    departure_override_reason: '',
    returned_to_store_at: null,
    elapsed_seconds: 0,
    route_revision: 1,
    last_optimized_at: null,
    maps_url: '',
    route_summary: {},
    progress: {
      total: 2,
      confirmed: 0,
      completed: 0,
      on_hold: 0,
      queued: 2,
      failed: 0,
      needs_reconcile: 0,
    },
    truck_photos: [],
    truck_photo_count: 0,
    max_truck_photos: 4,
    all_stops_called: false,
    all_stops_resolved: false,
    can_finish: false,
    return_issue_codes: [],
    next_action: null,
    allowed_actions: [],
    events: [],
    contact_dispositions: [],
    stops: [],
    ...partial,
  } as DeliveryRun;
}

describe('fieldStepUtils', () => {
  it('maps server phases onto the five UI steps', () => {
    expect(uiStepFromPhase('calls')).toBe('contact');
    expect(uiStepFromPhase('load')).toBe('load');
    expect(uiStepFromPhase('truck')).toBe('load');
    expect(uiStepFromPhase('route')).toBe('routes');
    expect(uiStepFromPhase('active')).toBe('deliveries');
    expect(uiStepFromPhase('return')).toBe('finish');
    expect(uiStepFromPhase('completed')).toBe('finish');
  });

  it('gates future steps until allowed actions unlock them', () => {
    const base = run({ phase: 'calls', allowed_actions: [] });
    expect(unlockedUiSteps(base)).toEqual(['contact']);
    expect(isUiStepUnlocked(base, 'load')).toBe(false);

    const withLoad = run({ phase: 'calls', allowed_actions: ['set_phase:load'] });
    expect(unlockedUiSteps(withLoad)).toContain('load');

    const onLoad = run({ phase: 'load', allowed_actions: ['set_phase:route'] });
    expect(unlockedUiSteps(onLoad)).toEqual(expect.arrayContaining(['contact', 'load', 'routes']));
  });

  it('colors contact / load / delivery dots from server truth', () => {
    expect(contactStopTone(stop({ id: 1 }))).toBe('pending');
    expect(contactStopTone(stop({ id: 1, contact_disposition: 'awaiting_reply' }))).toBe('caution');
    expect(contactStopTone(stop({ id: 1, contact_disposition: 'no_answer' }))).toBe('caution');
    expect(contactStopTone(stop({ id: 1, contact_disposition: 'confirmed' }))).toBe('complete');
    expect(contactStopTone(stop({ id: 1, contact_disposition: 'wrong_number' }))).toBe('issue');
    expect(contactStopTone(stop({ id: 1, contact_disposition: 'reschedule_requested' }))).toBe(
      'issue',
    );
    expect(isContactTerminal(stop({ id: 1, contact_disposition: 'awaiting_reply' }))).toBe(false);
    expect(isContactTerminal(stop({ id: 1, contact_disposition: 'confirmed' }))).toBe(true);
    expect(hasContactOutcome(stop({ id: 1, contact_disposition: 'awaiting_reply' }))).toBe(true);
    expect(hasContactOutcome(stop({ id: 1 }))).toBe(false);
    // Any recorded outcome (including yellow) unlocks Continue → Load.
    expect(
      contactWorkComplete([
        stop({ id: 1, contact_disposition: 'confirmed' }),
        stop({ id: 2, contact_disposition: 'awaiting_reply' }),
      ]),
    ).toBe(true);
    expect(
      contactWorkComplete([
        stop({ id: 1, contact_disposition: 'confirmed' }),
        stop({ id: 2, contact_disposition: 'cancel_requested' }),
      ]),
    ).toBe(true);
    expect(
      contactWorkComplete([
        stop({ id: 1, contact_disposition: 'confirmed' }),
        stop({ id: 2 }),
      ]),
    ).toBe(false);

    expect(
      loadStopTone(
        stop({
          id: 1,
          stop_items: [
            {
              id: 11,
              description: 'Sofa',
              quantity: 1,
              sku: 'A',
              is_verified: true,
              verification_skipped: false,
              has_load_photo: true,
              photo_exception: false,
              loaded_at: '2026-07-22T12:00:00Z',
              is_ready: true,
              scan_count: 1,
              scans_required: 1,
            } as never,
          ],
        }),
      ),
    ).toBe('complete');

    expect(deliveryStopTone(stop({ id: 1, state: 'completed' }))).toBe('complete');
    expect(deliveryStopTone(stop({ id: 1, state: 'on_hold', hold_reason: 'No one home' }))).toBe(
      'issue',
    );
  });

  it('preserves selection by stop id and clamps when the stop leaves', () => {
    const stops = [stop({ id: 10 }), stop({ id: 20 }), stop({ id: 30 })];
    expect(clampSelectedStopId(stops, 20, 10)).toBe(20);
    expect(clampSelectedStopId(stops, 99, 10)).toBe(10);
    expect(clampSelectedStopId([], 20, null)).toBeNull();
  });

  it('advances to the next stop still missing any contact outcome', () => {
    const stops = [
      stop({ id: 1, contact_disposition: 'confirmed' }),
      stop({ id: 2, contact_disposition: 'awaiting_reply' }),
      stop({ id: 3 }),
    ];
    expect(nextPendingStopId(stops, 1, hasContactOutcome)).toBe(3);
    expect(nextPendingStopId(stops, 2, hasContactOutcome)).toBe(3);
    expect(
      nextPendingStopId(
        [
          stop({ id: 1, contact_disposition: 'no_answer' }),
          stop({ id: 2 }),
          stop({ id: 3, contact_disposition: 'voicemail' }),
        ],
        1,
        hasContactOutcome,
      ),
    ).toBe(2);
    expect(
      nextPendingStopId(
        [
          stop({ id: 1, contact_disposition: 'awaiting_reply' }),
          stop({ id: 2, contact_disposition: 'confirmed' }),
          stop({ id: 3 }),
        ],
        3,
        hasContactOutcome,
      ),
    ).toBeNull();
    expect(
      nextPendingStopId(
        [
          stop({ id: 1, contact_disposition: 'confirmed' }),
          stop({ id: 2, contact_disposition: 'wrong_number' }),
        ],
        1,
        hasContactOutcome,
      ),
    ).toBeNull();
  });

  it('defaults contact selection to the first undisposed stop', () => {
    const r = run({
      stops: [
        stop({ id: 1, position: 0, contact_disposition: 'confirmed', is_confirmed: true }),
        stop({ id: 2, position: 1 }),
      ],
    });
    expect(defaultSelectedStopId(r, 'contact')).toBe(2);
  });

  it('loads all outcomes except reschedule/cancel; routes shows every contact', () => {
    const r = run({
      stops: [
        stop({ id: 1, position: 0, contact_disposition: 'confirmed', is_confirmed: true }),
        stop({ id: 2, position: 1, contact_disposition: 'no_answer', is_confirmed: false }),
        stop({
          id: 3,
          position: 2,
          contact_disposition: 'reschedule_requested',
          is_confirmed: false,
        }),
        stop({
          id: 4,
          position: 3,
          contact_disposition: 'cancel_requested',
          is_confirmed: false,
        }),
      ],
    });
    expect(isExcludedFromLoad(stop({ id: 3, contact_disposition: 'reschedule_requested' }))).toBe(
      true,
    );
    expect(stopsForUiStep(r, 'load').map((s) => s.id)).toEqual([1, 2]);
    expect(stopsForUiStep(r, 'routes').map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(
      routeInclusionTone(
        stop({
          id: 1,
          is_confirmed: true,
          stop_items: [
            {
              id: 11,
              description: 'Item',
              quantity: 1,
              is_ready: true,
              loaded_at: '2026-07-22T12:00:00Z',
            } as never,
          ],
        }),
      ),
    ).toBe('complete');
    expect(routeInclusionTone(stop({ id: 11, is_confirmed: true, stop_items: [] }))).toBe(
      'caution',
    );
    expect(routeInclusionTone(stop({ id: 2, contact_disposition: 'no_answer' }))).toBe('caution');
    expect(routeInclusionTone(stop({ id: 3, contact_disposition: 'cancel_requested' }))).toBe(
      'issue',
    );
    expect(isOnRoute(stop({ id: 1, is_confirmed: true }))).toBe(true);
    expect(isOnRoute(stop({ id: 2, contact_disposition: 'no_answer' }))).toBe(false);
  });

  it('partitions load board stops on truck vs not, ordered by load time', () => {
    const ready = (id: number, loadedAt: string) =>
      stop({
        id,
        position: id,
        contact_disposition: id === 2 ? 'no_answer' : 'confirmed',
        is_confirmed: id !== 2,
        stop_items: [
          {
            id: id * 10,
            description: 'Item',
            quantity: 1,
            sku: `S-${id}`,
            is_verified: true,
            verification_skipped: false,
            has_load_photo: false,
            photo_exception: false,
            loaded_at: loadedAt,
            is_ready: true,
            scan_count: 1,
            scans_required: 1,
          } as never,
        ],
      });
    const pending = stop({
      id: 3,
      position: 3,
      contact_disposition: 'awaiting_reply',
      stop_items: [
        {
          id: 30,
          description: 'Item',
          quantity: 1,
          sku: 'S-3',
          is_verified: false,
          verification_skipped: false,
          has_load_photo: false,
          photo_exception: false,
          loaded_at: null,
          is_ready: false,
          scan_count: 0,
          scans_required: 1,
        } as never,
      ],
    });
    const { onTruck, notOnTruck } = partitionLoadBoardStops([
      ready(2, '2026-07-24T12:05:00Z'),
      ready(1, '2026-07-24T12:00:00Z'),
      pending,
    ]);
    expect(onTruck.map((s) => s.id)).toEqual([1, 2]);
    expect(notOnTruck.map((s) => s.id)).toEqual([3]);
    expect(stopIsOnTruck(onTruck[0])).toBe(true);
    expect(stopNeedsScanBeforeLoad(pending)).toBe(true);
    expect(stopNeedsScanBeforeLoad(onTruck[0])).toBe(false);
  });

  it('normalizes swipe progress with a dead zone and 100% commit', () => {
    const width = 360;
    const dead = swipeDeadZoneDistance(width);
    const commit = swipeCommitDistance(width);

    expect(swipeProgressFromDelta(dead * 0.5, width)).toBe(0);
    expect(swipeProgressFromDelta(dead, width)).toBe(0);
    expect(swipeProgressFromDelta((dead + commit) / 2, width)).toBeGreaterThan(0);
    expect(swipeProgressFromDelta((dead + commit) / 2, width)).toBeLessThan(1);
    expect(swipeProgressFromDelta(commit, width)).toBe(1);
    expect(swipeProgressFromDelta(commit + 40, width)).toBe(1);
    expect(shouldCommitSwipe(0.99)).toBe(false);
    expect(shouldCommitSwipe(1)).toBe(true);
  });

  it('maps swipe direction and blocks edges', () => {
    expect(swipeDirectionFromDelta(-40)).toBe(1);
    expect(swipeDirectionFromDelta(40)).toBe(-1);
    expect(swipeDirectionFromDelta(0)).toBe(0);
    expect(canSwipeInDirection(0, 3, -1)).toBe(false);
    expect(canSwipeInDirection(0, 3, 1)).toBe(true);
    expect(canSwipeInDirection(2, 3, 1)).toBe(false);
    expect(canSwipeInDirection(2, 3, -1)).toBe(true);
  });

  it('applies edge resistance and locks axis for horizontal intent', () => {
    const width = 360;
    const free = swipeVisualOffset(-80, width, { canMove: true });
    const edge = swipeVisualOffset(-80, width, { canMove: false });
    expect(Math.abs(edge)).toBeLessThan(Math.abs(free));
    expect(lockSwipeAxis(2, 2)).toBeNull();
    expect(lockSwipeAxis(40, 8)).toBe('h');
    expect(lockSwipeAxis(8, 40)).toBe('v');
  });

  it('follows the live phase only when the driver was riding it', () => {
    // Riding the live edge: advance with the run.
    expect(
      resolveUiStepSync({
        uiStep: 'routes',
        serverStep: 'deliveries',
        previousServerStep: 'routes',
        manual: false,
      }),
    ).toBe('deliveries');
    // Manually parked on the step the run just left: still follow forward.
    expect(
      resolveUiStepSync({
        uiStep: 'routes',
        serverStep: 'deliveries',
        previousServerStep: 'routes',
        manual: true,
      }),
    ).toBe('deliveries');
    // Deliberately reviewing an earlier step: stay put.
    expect(
      resolveUiStepSync({
        uiStep: 'contact',
        serverStep: 'deliveries',
        previousServerStep: 'routes',
        manual: true,
      }),
    ).toBe('contact');
    // Never drag the driver backwards.
    expect(
      resolveUiStepSync({
        uiStep: 'finish',
        serverStep: 'deliveries',
        previousServerStep: 'routes',
        manual: false,
      }),
    ).toBe('finish');
  });

  it('knows when the driver is behind the live step', () => {
    expect(isBehindLiveStep('contact', 'deliveries')).toBe(true);
    expect(isBehindLiveStep('deliveries', 'deliveries')).toBe(false);
    expect(isBehindLiveStep('finish', 'deliveries')).toBe(false);
  });

  it('only suppresses taps after the swipe dead zone', () => {
    const width = 360;
    const dead = swipeDeadZoneDistance(width);
    expect(gestureSuppressesTap(10, width)).toBe(false);
    expect(gestureSuppressesTap(dead, width)).toBe(false);
    expect(gestureSuppressesTap(dead + 1, width)).toBe(true);
    expect(gestureSuppressesTap(-(dead + 8), width)).toBe(true);
  });

  it('formats compact item summaries for Load cards', () => {
    const item = (id: number, description: string) => ({
      id,
      description,
      quantity: 1,
      sku: `S-${id}`,
      is_verified: false,
      verification_skipped: false,
      has_load_photo: false,
      photo_exception: false,
      loaded_at: null,
      is_ready: false,
      scan_count: 0,
      scans_required: 1,
    });
    const multi = stop({
      id: 1,
      stop_items: [item(1, 'Couch'), item(2, 'Lamp'), item(3, 'Rug')] as never,
    });
    expect(stopItemCountLabel(multi)).toBe('3 items');
    expect(compactStopItemSummary(multi)).toBe('Couch · Lamp · +1');
    expect(compactStopItemSummary(stop({ id: 2, item_count: 2, stop_items: [] }))).toBe('2 items');
  });
});
