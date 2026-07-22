import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeskDayLiveMonitor } from './DeskDayLiveMonitor';
import type { DeliveryDayDetail } from '../../../../types/pos.types';

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseDay: DeliveryDayDetail = {
  id: 5,
  date: '2026-07-22',
  time_start: '10:00',
  time_end: '18:00',
  crew_size: 1,
  assigned_to: 'Driver',
  notes: '',
  is_active: true,
  is_bookable: true,
  planning_disposition: 'planned',
  display_state: 'planned',
  location_id: 1,
  primary_driver_id: 1,
  primary_driver_name: 'Driver',
  delivery_count: 0,
  items_booked: 0,
  completed_count: 0,
  cancelled_count: 0,
  is_test: false,
  test_dataset_key: null,
  run: null,
  assignments: [],
  jobs: [],
  items: [],
};

describe('DeskDayLiveMonitor', () => {
  it('shows inactive message when no run', () => {
    wrap(<DeskDayLiveMonitor day={baseDay} />);
    expect(screen.getByText(/No active run/i)).toBeInTheDocument();
  });

  it('does not poll when day is not active and has no run summary', () => {
    wrap(<DeskDayLiveMonitor day={baseDay} />);
    expect(screen.queryByText(/Live monitor/i)).not.toBeInTheDocument();
  });
});
