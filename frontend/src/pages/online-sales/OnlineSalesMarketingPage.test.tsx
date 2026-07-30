import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OnlineSalesMarketingPage from './OnlineSalesMarketingPage';

const marketingState = vi.hoisted(() => ({
  data: null as null | { count: number; results: unknown[] },
  isLoading: false,
  isError: false,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows }: { rows?: Array<Record<string, unknown>> }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <div key={String(r.id)}>
          <span>{String(r.title || '')}</span>
          <span>{String(r.fb_title || '')}</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useWebListings: () => ({
    data: marketingState.data,
    isLoading: marketingState.isLoading,
    isError: marketingState.isError,
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

describe('OnlineSalesMarketingPage', () => {
  beforeEach(() => {
    marketingState.data = null;
    marketingState.isLoading = false;
    marketingState.isError = false;
  });

  it('renders published listings for marketing', () => {
    marketingState.data = {
      count: 1,
      results: [
        {
          id: 4,
          title: 'Coffee table',
          fb_title: 'FB coffee table',
          fb_posted_at: null,
        },
      ],
    };
    wrap(<OnlineSalesMarketingPage />);
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('Coffee table')).toBeInTheDocument();
    expect(screen.getByText('FB coffee table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Blog Studio/i })).toBeInTheDocument();
  });

  it('renders empty published list', () => {
    marketingState.data = { count: 0, results: [] };
    wrap(<OnlineSalesMarketingPage />);
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText(/Facebook Page copy lives on each Listing/)).toBeInTheDocument();
  });

  it('renders with undefined data without crashing', () => {
    marketingState.data = null;
    wrap(<OnlineSalesMarketingPage />);
    expect(screen.getByText('Marketing')).toBeInTheDocument();
  });
});
