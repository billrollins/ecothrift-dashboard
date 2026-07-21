import { describe, expect, it } from 'vitest';
import {
  canBeginDriving,
  canCompleteStopNormally,
  canFinishDay,
  canProceedFromCalls,
  canProceedFromLoad,
  canProceedFromTruck,
  confirmationChip,
  confirmedStops,
  groupStopsByBoard,
  interpolateTemplateTokens,
  normalizeWizardPhase,
  stopsNeedingReconcile,
} from './driverWizardUtils';
import type { DeliveryRunStop } from '../../../types/pos.types';

function stop(
  partial: Partial<DeliveryRunStop> & { id: number; state: DeliveryRunStop['state'] },
): DeliveryRunStop {
  return {
    job_id: partial.id,
    position: 0,
    customer_name: 'Test',
    phone: '402',
    original_address: '1 Main',
    address: '1 Main',
    is_apt: false,
    unit: '',
    items_delivered: 'Washer',
    item_count: 1,
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
    call_attempts: [],
    attachments: [],
    address_revisions: [],
    text_templates: [],
    ...partial,
  };
}

describe('driverWizardUtils', () => {
  it('normalizes legacy phases onto the five-step flow', () => {
    expect(normalizeWizardPhase('start')).toBe('calls');
    expect(normalizeWizardPhase('review')).toBe('calls');
    expect(normalizeWizardPhase('truck')).toBe('load');
    expect(normalizeWizardPhase('active')).toBe('active');
  });

  it('gates calls / load / truck / begin driving', () => {
    expect(canProceedFromCalls({ all_stops_called: false })).toBe(false);
    expect(canProceedFromCalls({ all_stops_called: true })).toBe(true);
    expect(canProceedFromLoad({ all_loaded_secured: false })).toBe(false);
    expect(canProceedFromLoad({ all_loaded_secured: true })).toBe(true);
    expect(canProceedFromTruck({ truck_photo_count: 0 })).toBe(false);
    expect(canProceedFromTruck({ truck_photo_count: 1 })).toBe(true);
    expect(canBeginDriving({ all_loaded_secured: true, truck_photo_count: 0 })).toBe(false);
    expect(canBeginDriving({ all_loaded_secured: true, truck_photo_count: 1 })).toBe(true);
  });

  it('requires contact + delivered + proof + signature for normal complete', () => {
    expect(
      canCompleteStopNormally({
        contact_present_at: 'x',
        delivered_at: 'x',
        has_proof_photo: true,
        has_signature: false,
      }),
    ).toBe(false);
    expect(
      canCompleteStopNormally({
        contact_present_at: 'x',
        delivered_at: 'x',
        has_proof_photo: true,
        has_signature: true,
      }),
    ).toBe(true);
  });

  it('chips confirmation from latest call', () => {
    expect(confirmationChip({ is_confirmed: true, latest_call_result: 'answered_will_be_there', has_call_result: true }).label).toBe(
      'Confirmed',
    );
    expect(
      confirmationChip({
        is_confirmed: false,
        latest_call_result: 'wrong_number',
        has_call_result: true,
      }).label,
    ).toBe('Unavailable');
    expect(
      confirmationChip({ is_confirmed: false, latest_call_result: null, has_call_result: false }).label,
    ).toBe('Needs call');
  });

  it('groups board queues and reconcile candidates', () => {
    const groups = groupStopsByBoard([
      stop({ id: 1, state: 'next_up', is_confirmed: true }),
      stop({ id: 2, state: 'on_hold' }),
      stop({ id: 3, state: 'completed', is_confirmed: true }),
      stop({ id: 4, state: 'queued', is_confirmed: true }),
      stop({ id: 5, state: 'queued', is_confirmed: false, has_call_result: true }),
    ]);
    expect(groups.nextUp).toHaveLength(1);
    expect(groups.onHold.length).toBeGreaterThanOrEqual(1);
    expect(groups.completed).toHaveLength(1);
    expect(groups.queued).toHaveLength(1);
    expect(confirmedStops(groups.queued.concat(groups.nextUp))).toHaveLength(2);
    expect(
      stopsNeedingReconcile([
        stop({ id: 1, state: 'completed' }),
        stop({ id: 2, state: 'queued' }),
        stop({ id: 3, state: 'failed', return_reconciled_at: 'x' }),
      ]),
    ).toHaveLength(1);
  });

  it('gates end day', () => {
    expect(canFinishDay({ can_finish: true, returned_to_store_at: null })).toBe(false);
    expect(canFinishDay({ can_finish: true, returned_to_store_at: 'x' })).toBe(true);
  });

  it('interpolates template tokens', () => {
    expect(
      interpolateTemplateTokens('Hi {name}, ETA {eta} on {date}', {
        name: 'Sam',
        eta: '10–10:20',
        date: 'Saturday',
      }),
    ).toBe('Hi Sam, ETA 10–10:20 on Saturday');
  });
});
