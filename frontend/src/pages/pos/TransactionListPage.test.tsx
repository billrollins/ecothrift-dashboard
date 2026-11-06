import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReturnHistoryRow } from '../../api/thriftplusReturns.api';

const api = vi.hoisted(() => ({ fetchReturnHistory: vi.fn() }));
vi.mock('../../api/thriftplusReturns.api', async (orig) => ({
  ...(await orig<typeof import('../../api/thriftplusReturns.api')>()),
  ...api,
}));
const auth = vi.hoisted(() => ({ user: { role: 'Employee', is_superuser: false } as { role: string; is_superuser: boolean } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
const openObject = vi.hoisted(() => vi.fn());
vi.mock('../../components/objects/ObjectModal', () => ({ useObjectModal: () => ({ openObject }) }));
const carts = vi.hoisted(() => ({ useCarts: vi.fn(), useCartSummary: vi.fn() }));
vi.mock('../../hooks/usePOS', () => ({
  useCarts: (...a: unknown[]) => carts.useCarts(...a),
  useCartSummary: (...a: unknown[]) => carts.useCartSummary(...a),
}));
// The repo's stand-in grid: a row per item, each cell from renderCell, valueGetter or the field.
vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, columns, onRowClick, getRowId }: {
    rows?: Array<Record<string, unknown>>;
    getRowId?: (row: Record<string, unknown>) => unknown;
    columns?: Array<{
      field: string; headerName?: string;
      renderCell?: (p: { row: Record<string, unknown> }) => unknown;
      valueGetter?: (v: unknown, row: Record<string, unknown>) => unknown;
    }>;
    onRowClick?: (p: { row: Record<string, unknown> }) => void;
  }) => (
    <div role="grid">
      <div>{(columns || []).map((c) => c.headerName).join('|')}</div>
      {(rows || []).map((row) => (
        <div key={String(getRowId ? getRowId(row) : row.id)} onClick={() => onRowClick?.({ row })}>
          {(columns || []).map((col) => (
            <div key={col.field}>
              {(col.renderCell ? col.renderCell({ row }) : String((col.valueGetter ? col.valueGetter(row[col.field], row) : row[col.field]) ?? '')) as never}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));
vi.mock('../../hooks/useEmployees', () => ({ useUsers: () => ({ data: { results: [{ id: 4, full_name: 'Pat Clerk' }] } }) }));

import TransactionListPage from './TransactionListPage';

const ON_TIME: ReturnHistoryRow = {
  id: 1, created_at: '2026-11-04T15:00:00Z', cart: 50, receipt_number: 'R-20261103-050', sold_at: '2026-11-03T22:29:00Z',
  sku: 'ITM0207206', title: '5-Cup Rice Cooker', member: 'José Magana', person_id: 7, credit: '46.40', bucks_taken: '8.23',
  bucks_back: '0.00', returned_by: 'Pat Clerk', late: false, mark: null,
};
const LATE: ReturnHistoryRow = {
  ...ON_TIME, id: 2, cart: 87, receipt_number: 'R-20261030-087', sku: 'ITM100', title: 'Brass lamp', credit: '68.48', late: true,
  mark: { reason_label: 'Store was closed', note: 'storm', cashier: 'Sam Lee', approved_by: 'Mia Manager', by_pin: true, days_late: 2 },
};

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.search}</div>;
}

function renderPage(url = '/pos/transactions') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <TransactionListPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.fetchReturnHistory.mockReset();
  api.fetchReturnHistory.mockImplementation(async (p: Record<string, unknown>) => {
    const rows = auth.user.role === 'Employee' ? [{ ...LATE, mark: null }, ON_TIME] : [LATE, ON_TIME];
    const results = p.late ? rows.filter((r) => r.late) : rows;
    return { count: results.length, credit_total: '114.88', results };
  });
  carts.useCarts.mockReturnValue({ data: { count: 0, results: [] }, isLoading: false });
  carts.useCartSummary.mockReturnValue({ data: undefined });
  openObject.mockReset();
  auth.user = { role: 'Employee', is_superuser: false };
});

describe('Transactions: checkouts and returns (#72)', () => {
  it('opens on Checkouts; the Returns tab lists every return, late ones marked, and a row opens its sale', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('tab', { name: 'Checkouts', selected: true })).toBeInTheDocument();
    expect(api.fetchReturnHistory).not.toHaveBeenCalled();
    expect(screen.getAllByText('Cashier').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Returns' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?show=returns');
    expect(screen.getAllByText('Taken by').length).toBeGreaterThan(0); // the same box, for returns
    expect(await screen.findByText('Brass lamp')).toBeInTheDocument();
    expect(screen.getByText('5-Cup Rice Cooker')).toBeInTheDocument();
    expect(screen.getByTestId('returns-grid-total')).toHaveTextContent('2 returns · $114.88 Thrift+ credit given back');
    expect(screen.getByTestId('late-chip')).toHaveTextContent(/^Late$/);
    expect(screen.getAllByRole('grid')[0]).not.toHaveTextContent('Mark against'); // the mark is the managers'
    await user.click(screen.getByText('Brass lamp'));
    expect(openObject).toHaveBeenCalledWith({ type: 'sale', id: 87 });
  });

  it('the Owner page link (?show=returns&late=1&from=) opens the late ones of those days, and managers see the mark', async () => {
    auth.user = { role: 'Manager', is_superuser: false };
    renderPage('/pos/transactions?show=returns&late=1&from=2026-10-29');
    await waitFor(() => expect(api.fetchReturnHistory).toHaveBeenCalledWith(expect.objectContaining({ date_from: '2026-10-29' })));
    expect(screen.getByRole('tab', { name: 'Returns', selected: true })).toBeInTheDocument();
    await waitFor(() => expect(api.fetchReturnHistory).toHaveBeenCalledWith(expect.objectContaining({ late: 1 })));
    const grid = (await screen.findAllByRole('grid'))[0];
    const chip = await within(grid).findByTestId('late-chip');
    expect(chip).toHaveTextContent(/^Late$/);
    await userEvent.setup().hover(chip);
    const mark = await screen.findByTestId('late-mark');
    expect(mark).toHaveTextContent('Store was closed · 2 days late');
    expect(mark).toHaveTextContent('Mark against Sam Lee');
    expect(mark).toHaveTextContent('Allowed by Mia Manager');
    await userEvent.setup().click(chip);
    expect(openObject).not.toHaveBeenCalled(); // a tap on the chip is not a tap on the row
    expect(screen.queryByText('5-Cup Rice Cooker')).not.toBeInTheDocument();
  });

  it('the search, dates and cashier filter the returns too', async () => {
    const user = userEvent.setup();
    renderPage('/pos/transactions?show=returns');
    await screen.findByText('Brass lamp');
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'lamp{Enter}');
    await waitFor(() => expect(api.fetchReturnHistory).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'lamp', page: 1 })));
    await user.click(screen.getByText('Today'));
    await waitFor(() => expect(api.fetchReturnHistory).toHaveBeenLastCalledWith(expect.objectContaining({ date_from: expect.any(String), date_to: expect.any(String) })));
  });
});
