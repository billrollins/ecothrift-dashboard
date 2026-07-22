import { describe, expect, it } from 'vitest';
import type { DeliveryDayDetail, DeliveryRun, DeliveryRunStop } from '../../../../types/pos.types';
import {
  confirmedStops,
  fieldPrimaryAction,
  fieldStageLabel,
  flattenStopItemsQueue,
  formatElapsed,
  hasDirtyFieldState,
  normalizeFieldPhase,
  resolveFieldStage,
  unconfirmedStops,
} from './fieldRunUtils';

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
    elapsed_seconds: 120,
    route_revision: 0,
    last_optimized_at: null,
    maps_url: '',
    route_summary: {},
    notes: '',
    returned_to_store_at: null,
    truck_photos: [],
    truck_photo_count: 0,
    max_truck_photos: 4,
    all_loaded_secured: false,
    all_stops_called: false,
    can_finish: false,
    next_action: 'call',
    allowed_actions: ['call', 'set_phase:load'],
    progress: {
      total: 2,
      confirmed: 0,
      completed: 0,
      on_hold: 0,
      queued: 2,
      failed: 0,
      needs_reconcile: 0,
    },
    next_up: null,
    stops: [],
    service_minutes_per_stop: 15,
    return_issue_codes: [],
    ...partial,
  };
}

describe('fieldRunUtils', () => {
  it('normalizes legacy phases', () => {
    expect(normalizeFieldPhase('start')).toBe('calls');
    expect(normalizeFieldPhase('review')).toBe('calls');
    expect(normalizeFieldPhase('load')).toBe('load');
  });

  it('resolves Start Today vs Not Now stages', () => {
    const day = {
      id: 1,
      date: '2026-07-22',
      display_state: 'planned',
    } as DeliveryDayDetail;
    expect(resolveFieldStage(day, null, false)).toBe('planned');
    expect(resolveFieldStage(day, null, true)).toBe('readonly');
    expect(resolveFieldStage(day, run({ phase: 'load' }), false)).toBe('load');
    expect(
      resolveFieldStage(
        { ...day, display_state: 'completed' } as DeliveryDayDetail,
        run({ status: 'completed', phase: 'return' }),
        false,
      ),
    ).toBe('completed');
  });

  it('formats elapsed timer', () => {
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(3661)).toBe('1:01:01');
  });

  it('separates confirmed and unconfirmed pools', () => {
    const r = run({
      stops: [
        stop({ id: 1, is_confirmed: true, needs_call_again: false }),
        stop({ id: 2, is_confirmed: false }),
        stop({ id: 3, is_confirmed: false, excluded_unconfirmed: true }),
      ],
    });
    expect(confirmedStops(r)).toHaveLength(1);
    expect(unconfirmedStops(r)).toHaveLength(1);
  });

  it('flattens stop items for load queue', () => {
    const r = run({
      stops: [
        stop({
          id: 1,
          position: 1,
          stop_items: [
            {
              id: 10,
              stop_id: 1,
              job_item_id: null,
              sku: 'A',
              description: 'A',
              quantity: 1,
              position: 0,
              is_scannable: true,
              scan_count: 0,
              scans_required: 1,
              is_verified: false,
              verification_skipped: false,
              verification_skip_reason: '',
              loaded_at: null,
              has_load_photo: false,
              photo_exception: false,
              photo_exception_reason: '',
              is_ready: false,
              scans: [],
              photos: [],
            },
          ],
        }),
      ],
    });
    expect(flattenStopItemsQueue(r)).toHaveLength(1);
  });

  it('primary action prefers phase transitions from allowed_actions', () => {
    expect(fieldPrimaryAction(run({ next_action: 'set_phase:load' }))?.action).toBe('set_phase:load');
    expect(fieldStageLabel('truck')).toBe('Close truck');
  });

  it('dirty guard detects pending uploads and drafts', () => {
    expect(hasDirtyFieldState({ pendingUploads: 0, draftNote: '', draftSku: '' })).toBe(false);
    expect(hasDirtyFieldState({ pendingUploads: 1, draftNote: '', draftSku: '' })).toBe(true);
    expect(hasDirtyFieldState({ pendingUploads: 0, draftNote: 'x', draftSku: '' })).toBe(true);
  });
});
