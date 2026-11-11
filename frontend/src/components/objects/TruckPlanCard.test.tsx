import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TruckPlanDTO, TruckPlanWindowDTO } from '../../api/truckPlan.api';
import { ObjectModalProvider } from './ObjectModal';
import { TruckPlanCardBody } from './TruckPlanCard';

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));

const DEFAULT_PLAN: TruckPlanDTO = {
  is_default: true, pricing_start_pct: '55', watch_for: 'Missing and broken items. Mark them the day you find them.',
  known_issues: '', crew: [], dispute_due_date: null, updated_by: '', updated_at: null,
};

function windowData(plan: TruckPlanDTO, over: Partial<TruckPlanWindowDTO> = {}): TruckPlanWindowDTO {
  return {
    order: { id: 7, order_number: 'PO-7', vendor: 'Target', description: 'General merchandise', notes: '' },
    paid: { total: '520.00', price: '200.00', fees: '20.00', shipping: '300.00' },
    target: { total: '1040.00', default: '1040.00', is_default: true, multiple: 2, set_by: '', set_at: null },
    on_track: {
      total: '1150.00', priced_so_far: '700.00', priced_items: 40, estimated_left: '450.00', units_left: 30,
      units_own_price: 20, units_by_rate: 10, units_no_estimate: 0, rate_pct: 55, rate_basis: 'plan', vs_target: '110.00',
    },
    disputes: {
      items: 0, retail: '0.00', retail_pct: 0, truck_retail: '1000.00', threshold_pct: 5, threshold_retail: '50.00',
      over_threshold: false, price_plus_fees: '220.00', worth: '0.00', lines_without_retail: 0,
      parts: { not_received: { units: 0, retail: '0.00' }, broken: { units: 0, retail: '0.00' }, damaged: { units: 0, retail: '0.00' } },
    },
    dates: { delivered: '2026-11-05', expected_delivery: null, dispute_due: '2026-11-11', dispute_due_from_plan: false, dispute_business_days: 4 },
    claim: { filed: false, filed_on: null, amount_asked: null, amount_back: null, finalized_at: null, not_filed: null },
    plan,
    can_set_target: false,
    can_edit_default: false,
    staff: [],
    ...over,
  };
}

function show(data: TruckPlanWindowDTO) {
  client.get.mockResolvedValue({ data });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter><ObjectModalProvider><TruckPlanCardBody orderId={7} /></ObjectModalProvider></MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Truck Plan window: never blank (#99)', () => {
  it('a truck with no plan of its own reads the default plan, marked so', async () => {
    show(windowData(DEFAULT_PLAN));
    expect(await screen.findByText('Default plan')).toBeInTheDocument();
    expect(screen.getByText('55% of retail')).toBeInTheDocument();
    expect(screen.getByText('Missing and broken items. Mark them the day you find them.')).toBeInTheDocument();
    // No blank state is left.
    expect(screen.queryByText(/No plan yet|No truck plan yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Write the plan|Make the plan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to the default' })).not.toBeInTheDocument();
    // Only a superuser edits the store default.
    expect(screen.queryByRole('button', { name: 'Edit the default plan' })).not.toBeInTheDocument();
  });

  it('changing it starts from the default and says it makes the truck its own', async () => {
    show(windowData(DEFAULT_PLAN));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Change the plan' }));
    expect(screen.getByText("This starts from the default plan. Saving makes it this truck's own plan.")).toBeInTheDocument();
    expect(screen.getByLabelText('Pricing start, percent of retail')).toHaveValue('55');
  });

  it("a truck's own plan has no Default plan mark and can go back to the default", async () => {
    show(windowData({ ...DEFAULT_PLAN, is_default: false, pricing_start_pct: '40', updated_by: 'Pat Proc', updated_at: '2026-11-10T15:00:00Z' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Back to the default' }));
    expect(screen.queryByText('Default plan')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, back to the default' })).toBeInTheDocument();
  });

  it('a superuser can edit the store default from the window', async () => {
    show(windowData(DEFAULT_PLAN, { can_edit_default: true }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Edit the default plan' }));
    expect(screen.getByText(/Every truck without a plan of its own uses this/)).toBeInTheDocument();
    expect(screen.getByLabelText('Default pricing start, percent of retail')).toHaveValue('55');
  });
});
