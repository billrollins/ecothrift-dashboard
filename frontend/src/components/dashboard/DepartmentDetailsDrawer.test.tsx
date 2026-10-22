import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepartmentDetails } from '../../types/pos.types';
import { DepartmentDetailsDrawer, type DepartmentDetailsRequest } from './DepartmentDetailsDrawer';

const api = vi.hoisted(() => ({ getDashboardDepartmentDetails: vi.fn() }));
vi.mock('../../api/pos.api', () => api);

const layout = vi.hoisted(() => ({ isMobile: false }));
vi.mock('./useDashboardLayout', () => ({
  useDashboardLayout: () => ({ isMobile: layout.isMobile, isCompact: false }),
}));

const period = { start: '2026-10-19', end: '2026-10-22' };

function renderDrawer(request: DepartmentDetailsRequest, data: DepartmentDetails) {
  api.getDashboardDepartmentDetails.mockResolvedValue({ data });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <DepartmentDetailsDrawer request={request} onClose={() => undefined} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('DepartmentDetailsDrawer', () => {
  beforeEach(() => {
    api.getDashboardDepartmentDetails.mockReset();
    layout.isMobile = false;
  });

  it('Buying: the orders of the period with their cost, each linking to its order', async () => {
    renderDrawer(
      { department: 'buying', label: 'Buying', metricLabel: 'Purchased inventory', period },
      {
        department: 'buying',
        ...period,
        rows: [
          { id: 41, order_number: 'AMZ-1', vendor: 'Amazon', description: '', ordered_date: '2026-10-20', status: 'paid', status_label: 'Paid', total_cost: '1200.00' },
          { id: 42, order_number: 'TGT-2', vendor: 'Target', description: '', ordered_date: '2026-10-19', status: 'ordered', status_label: 'Ordered', total_cost: null },
        ],
        totals: { orders: 2, total_cost: '1200.00' },
      },
    );
    expect(await screen.findByRole('link', { name: 'AMZ-1' })).toHaveAttribute('href', '/inventory/orders/41');
    expect(screen.getByRole('link', { name: 'TGT-2' })).toHaveAttribute('href', '/inventory/orders/42');
    expect(screen.getByText('2 orders · $1,200')).toBeInTheDocument();
    expect(screen.getByText('No cost yet')).toBeInTheDocument();
    expect(screen.getByText('Purchased inventory · Mon 10/19 - Thu 10/22')).toBeInTheDocument();
    expect(api.getDashboardDepartmentDetails).toHaveBeenCalledWith({ department: 'buying', ...period });
  });

  it('Processing: per person, each row opening Inventory search on their items', async () => {
    renderDrawer(
      { department: 'processing', label: 'Processing', metricLabel: 'Processed inventory, at our price', period },
      {
        department: 'processing',
        ...period,
        rows: [
          { user_id: 4, name: 'Ana Tester', items: 39, total_price: '7500.00', total_retail: '15962.00', missing_retail: 1 },
          { user_id: null, name: 'Not recorded', items: 2, total_price: '20.00', total_retail: '40.00', missing_retail: 0 },
        ],
        totals: { items: 41, total_price: '7520.00', total_retail: '16002.00', missing_retail: 1 },
      },
    );
    const ana = await screen.findByRole('link', { name: 'Ana Tester: open these 39 items in Inventory search' });
    expect(ana).toHaveAttribute('href', '/inventory/search?processed_by=4&from=2026-10-19&to=2026-10-22');
    expect(screen.getByRole('link', { name: /Not recorded/ })).toHaveAttribute(
      'href',
      '/inventory/search?processed_by=none&from=2026-10-19&to=2026-10-22',
    );
    expect(screen.getByText('41 items · $7,520 at our price · $16,002 retail')).toBeInTheDocument();
    expect(screen.getByText('1 without')).toBeInTheDocument();
  });

  it('Restoration: per person with value added, unmeasured jobs flagged, in a phone sheet', async () => {
    layout.isMobile = true;
    renderDrawer(
      { department: 'restoration', label: 'Restoration', metricLabel: 'Count of items finished', period: { start: '2026-10-20', end: '2026-10-20' } },
      {
        department: 'restoration',
        start: '2026-10-20',
        end: '2026-10-20',
        rows: [{ user_id: 6, name: 'Mia Tester', items: 3, value_added: '120.00', unmeasured: 1 }],
        totals: { items: 3, value_added: '120.00', unmeasured: 1 },
      },
    );
    expect(await screen.findByText('Mia Tester')).toBeInTheDocument();
    expect(screen.getByText('3 items finished · $120 value added')).toBeInTheDocument();
    expect(screen.getByText('1 not measured')).toBeInTheDocument();
    expect(screen.getByText('Count of items finished · Tue 10/20')).toBeInTheDocument();
  });

  it('says so when a period is empty', async () => {
    renderDrawer(
      { department: 'buying', label: 'Buying', metricLabel: 'Purchased inventory', period },
      { department: 'buying', ...period, rows: [], totals: { orders: 0, total_cost: '0' } },
    );
    expect(await screen.findByText('Nothing in this period.')).toBeInTheDocument();
  });
});
