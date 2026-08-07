import { describe, expect, it } from 'vitest';
import {
  confirmedStops,
  interpolateTemplateTokens,
  normalizeWizardPhase,
  stopLineItems,
  telHref,
  unconfirmedStops,
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

  it('splits partitions confirmed from unconfirmed stops', () => {
    const stops = [
      stop({ id: 1, state: 'next_up', is_confirmed: true }),
      stop({ id: 2, state: 'queued', is_confirmed: false }),
      stop({ id: 3, state: 'queued', is_confirmed: true }),
    ];
    expect(confirmedStops(stops)).toHaveLength(2);
    expect(unconfirmedStops(stops)).toHaveLength(1);
  });

  it('falls back to parsed item text when a stop has no line items', () => {
    const parsed = stopLineItems(stop({ id: 1, state: 'queued', items_delivered: 'Washer, Dryer' }));
    expect(parsed.map((i) => i.description)).toEqual(['Washer', 'Dryer']);
    const empty = stopLineItems(stop({ id: 2, state: 'queued', items_delivered: '' }));
    expect(empty).toHaveLength(1);
    expect(empty[0].description).toBe('Delivery items');
  });

  it('strips punctuation from tel hrefs', () => {
    expect(telHref('(402) 555-0177')).toBe('tel:4025550177');
  });

  it('interpolates template tokens', () => {
    expect(
      interpolateTemplateTokens('Hi {name}, ETA {eta} on {date}', {
        name: 'Sam',
        eta: '10-10:20',
        date: 'Saturday',
      }),
    ).toBe('Hi Sam, ETA 10-10:20 on Saturday');
  });
});
