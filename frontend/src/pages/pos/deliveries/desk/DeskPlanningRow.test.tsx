import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DeliveryJob } from '../../../../types/pos.types';
import { DeskPlanningRow } from './DeskPlanningRow';

function job(partial?: Partial<DeliveryJob>): DeliveryJob {
  return {
    id: 11,
    customer_name: 'Pat Customer',
    phone: '402-555-0100',
    address: '100 Main St',
    delivery_address: '100 Main St',
    items_delivered: 'Washer',
    item_count: 1,
    status: 'scheduled',
    scheduled_date: '2026-07-28',
    is_apt: false,
    unit: '',
    notes: '',
    tier: '',
    fee: '0',
    is_archived: false,
    items: [],
    ...partial,
  } as DeliveryJob;
}

describe('DeskPlanningRow', () => {
  it('renders customer and status and activates on click', () => {
    const onActivate = vi.fn();
    render(<DeskPlanningRow job={job()} onActivate={onActivate} />);
    expect(screen.getByText('Pat Customer')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
