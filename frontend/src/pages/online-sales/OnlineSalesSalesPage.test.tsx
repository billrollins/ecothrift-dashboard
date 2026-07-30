import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OnlineSalesSalesPage from './OnlineSalesSalesPage';

const salesState = vi.hoisted(() => ({
  data: null as null | unknown[],
  isLoading: false,
  isError: false,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows }: { rows?: Array<Record<string, unknown>> }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <div key={String(r.id)}>
          <span>{String(r.listing_title || '')}</span>
          <span>{String(r.customer_name || '')}</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useSalesLog: () => ({
    data: salesState.data,
    isLoading: salesState.isLoading,
    isError: salesState.isError,
  }),
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OnlineSalesSalesPage', () => {
  beforeEach(() => {
    salesState.data = null;
    salesState.isLoading = false;
    salesState.isError = false;
  });

  it('renders completed sales rows', () => {
    salesState.data = [
      {
        id: 22,
        completed_at: '2026-07-28T16:00:00Z',
        listing_title: 'Vintage lamp',
        customer_name: 'Bill',
        quantity: 1,
        line_total: '40.00',
        cost_snapshot: '10.00',
        fee_amount: '0.00',
        contribution: '30.00',
        pos_cart: 501,
      },
    ];
    wrap(<OnlineSalesSalesPage />);
    expect(screen.getByText('Sales log')).toBeInTheDocument();
    expect(screen.getByText('Vintage lamp')).toBeInTheDocument();
    expect(screen.getByText('Bill')).toBeInTheDocument();
  });

  it('renders empty sales log', () => {
    salesState.data = [];
    wrap(<OnlineSalesSalesPage />);
    expect(screen.getByText('Sales log')).toBeInTheDocument();
    expect(screen.getByText(/Contribution ≈ gross/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    salesState.isError = true;
    wrap(<OnlineSalesSalesPage />);
    expect(screen.getByText('Could not load the sales log.')).toBeInTheDocument();
  });
});
