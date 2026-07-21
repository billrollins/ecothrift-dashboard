import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeliveryDayCard } from './DeliveryDayCard';
import type { DeliveryDayCardModel } from './dayBoardUtils';
import type { DeliveryJob } from '../../../types/pos.types';

function card(partial?: Partial<DeliveryDayCardModel>): DeliveryDayCardModel {
  const job: DeliveryJob = {
    id: 1,
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
    notes: 'Gate code 1',
    created_by: null,
  };
  return {
    key: 'job-1',
    job,
    stop: null,
    order: 0,
    customer_name: 'Alice',
    phone: '402-555-0001',
    address: '100 Main St',
    original_address: '100 Main St',
    address_corrected: false,
    notes: 'Gate code 1',
    item_count: 1,
    items_delivered: 'Washer',
    line_items: [{ line_id: 1, description: 'Washer', sku: 'W1', quantity: 1, scannable: true }],
    fee: '50.00',
    job_status: 'scheduled',
    stop_state: null,
    is_confirmed: false,
    has_call_result: false,
    eta_arrive_at: null,
    eta_window_end_at: null,
    drive_seconds_from_prev: null,
    loaded: false,
    secured: false,
    is_next_up: false,
    needs_reconcile: false,
    group: 'actionable',
    ...partial,
  };
}

describe('DeliveryDayCard', () => {
  it('opens details when the card shell is clicked', () => {
    const onOpen = vi.fn();
    render(
      <DeliveryDayCard
        card={card()}
        stage="initial"
        indexLabel="#1"
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open delivery for Alice/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not open details when an inline control is clicked', () => {
    const onOpen = vi.fn();
    render(
      <DeliveryDayCard
        card={card()}
        stage="calls"
        indexLabel="#1"
        onOpen={onOpen}
        phaseActions={
          <button type="button" data-testid="inline-save">
            Save call
          </button>
        }
      />,
    );
    fireEvent.click(screen.getByTestId('inline-save'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
