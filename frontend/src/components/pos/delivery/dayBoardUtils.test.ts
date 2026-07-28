import { describe, expect, it } from 'vitest';
import { buildDeliveryDayCards, resolveDayBoardStage } from './dayBoardUtils';
import type { DeliveryJob, DeliveryRun, DeliveryRunStop } from '../../../types/pos.types';

function job(partial: Partial<DeliveryJob> & { id: number }): DeliveryJob {
  return {
    availability: 1,
    scheduled_date: '2026-07-25',
    cart: null,
    cart_line: null,
    customer_name: 'Alice',
    phone: '402-555-0001',
    address: '100 Main St',
    is_apt: false,
    unit: '',
    items_delivered: 'Washer',
    item_count: 1,
    tier: '5mi',
    fee: '50.00',
    distance_miles: '2',
    distance_mode: 'road',
    status: 'scheduled',
    notes: '',
    created_by: null,
    ...partial,
  };
}

function stop(
  partial: Partial<DeliveryRunStop> & { id: number; job_id: number; state: DeliveryRunStop['state'] },
): DeliveryRunStop {
  return {
    position: 0,
    customer_name: 'Alice',
    phone: '402',
    original_address: '100 Main',
    address: '100 Main',
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

describe('dayBoardUtils', () => {
  it('resolves stages from run', () => {
    expect(resolveDayBoardStage(null)).toBe('initial');
    expect(
      resolveDayBoardStage({
        status: 'completed',
        phase: 'return',
      } as DeliveryRun),
    ).toBe('completed');
    expect(
      resolveDayBoardStage({
        status: 'preparing',
        phase: 'review',
      } as DeliveryRun),
    ).toBe('calls');
  });

  it('merges jobs with stops and prefers stop order', () => {
    const cards = buildDeliveryDayCards(
      [job({ id: 10, customer_name: 'Bob' }), job({ id: 11, customer_name: 'Alice' })],
      {
        id: 1,
        date: '2026-07-25',
        status: 'preparing',
        phase: 'route',
        stops: [
          stop({
            id: 1,
            job_id: 11,
            state: 'queued',
            position: 0,
            is_confirmed: true,
            has_call_result: true,
            latest_call_result: 'answered_will_be_there',
            customer_name: 'Alice',
          }),
          stop({
            id: 2,
            job_id: 10,
            state: 'queued',
            position: 1,
            is_confirmed: false,
            has_call_result: true,
            latest_call_result: 'no_answer',
            customer_name: 'Bob',
          }),
        ],
      } as DeliveryRun,
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].customer_name).toBe('Alice');
    expect(cards[0].group).toBe('actionable');
    expect(cards[1].group).toBe('excluded');
  });

  it('keeps rescheduled and completed cards discoverable', () => {
    const cards = buildDeliveryDayCards(
      [
        job({ id: 1, customer_name: 'Done', status: 'completed' }),
        job({ id: 2, customer_name: 'Moved', status: 'scheduled' }),
        job({ id: 3, customer_name: 'Active', status: 'scheduled' }),
      ],
      {
        id: 9,
        date: '2026-07-25',
        status: 'en_route',
        phase: 'active',
        stops: [
          stop({
            id: 1,
            job_id: 3,
            state: 'next_up',
            position: 0,
            customer_name: 'Active',
            is_confirmed: true,
            has_call_result: true,
            latest_call_result: 'answered_will_be_there',
          }),
          stop({
            id: 2,
            job_id: 1,
            state: 'completed',
            position: 1,
            customer_name: 'Done',
            is_confirmed: true,
            has_call_result: true,
            latest_call_result: 'answered_will_be_there',
          }),
          stop({
            id: 3,
            job_id: 2,
            state: 'rescheduled',
            position: 2,
            customer_name: 'Moved',
            is_confirmed: false,
            has_call_result: true,
            latest_call_result: 'no_answer',
          }),
        ],
      } as DeliveryRun,
    );
    expect(cards.map((c) => c.customer_name)).toEqual(['Active', 'Moved', 'Done']);
    expect(cards.find((c) => c.customer_name === 'Moved')?.group).toBe('rescheduled');
    expect(cards.find((c) => c.customer_name === 'Done')?.group).toBe('completed');
    expect(cards.find((c) => c.customer_name === 'Active')?.is_next_up).toBe(true);
  });

  it('uses scheduled order before a run exists', () => {
    const cards = buildDeliveryDayCards(
      [job({ id: 5, customer_name: 'B' }), job({ id: 2, customer_name: 'A' })],
      null,
    );
    expect(cards.map((c) => c.customer_name)).toEqual(['A', 'B']);
    expect(cards.every((c) => c.stop === null)).toBe(true);
  });
});
