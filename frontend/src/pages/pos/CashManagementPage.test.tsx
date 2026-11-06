import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ audit: vi.fn(), bags: [] as unknown[] }));
vi.mock('../../hooks/useCashManagement', () => ({
  useSupplemental: () => ({ data: { current_total: '300.00', last_counted_at: '2026-11-04T20:00:00Z', last_counted_by_name: 'Mia Manager' }, isLoading: false }),
  useSupplementalTransactions: () => ({ data: [
    { id: 1, transaction_type: 'to_safe', total: '20.00', performed_by_name: 'Mia Manager', performed_at: '2026-11-04T20:00:00Z' },
  ] }),
  useBankTransactions: () => ({ data: { results: [
    { id: 9, transaction_type: 'deposit', total: '540.00', status: 'pending', performed_by_name: 'Bill Owner', created_at: '2026-11-04T21:00:00Z' },
  ] } }),
  useAuditSupplemental: () => ({ mutateAsync: m.audit }),
}));
vi.mock('../../hooks/useSafe', () => ({ useBankDeposits: () => ({ data: { bags: m.bags, pending: [] }, isLoading: false }) }));
vi.mock('../../components/pos/SafeCard', () => ({ default: () => <div data-testid="safe-card" /> }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { language: 'en' } }) }));
vi.mock('../../components/pos/CountWindow', () => ({
  default: ({ open, title, onSubmit }: { open: boolean; title: string; onSubmit: (c: Record<string, number>) => Promise<unknown> }) =>
    open ? <button type="button" onClick={() => void onSubmit({ twenties: 10, fives: 20 })}>{title}</button> : null,
}));

import CashManagementPage from './CashManagementPage';

function renderPage() {
  return render(<SnackbarProvider><CashManagementPage /></SnackbarProvider>);
}

beforeEach(() => {
  m.audit.mockReset();
  m.audit.mockResolvedValue({});
  m.bags = [
    { kind: 'drop', ref: 1, at: '2026-11-04T18:00:00Z', register: 'Register 1', total: '200.00', count: { twenties: 10 }, note: '' },
    { kind: 'close_out', ref: 7, at: '2026-11-04T22:00:00Z', register: 'Register 2', total: '86.00', count: { twenties: 4, fives: 1, ones: 1 }, note: '' },
  ];
});

describe('Cash Drops (#70)', () => {
  it('shows the cash drop box envelope by envelope, the safe, the office drawer and the bank history', () => {
    renderPage();
    expect(screen.getByText('Cash Drops')).toBeInTheDocument();
    const box = screen.getByTestId('cash-drop-box');
    expect(box).toHaveTextContent('$286.00');
    const envelopes = within(box).getAllByTestId('envelope');
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).toHaveTextContent('Register 1');
    expect(envelopes[0]).toHaveTextContent('Cash drop');
    expect(envelopes[1]).toHaveTextContent('End of day');
    expect(envelopes[1]).toHaveTextContent('4 × $20');
    expect(screen.getByTestId('safe-card')).toBeInTheDocument();
    expect(screen.getByTestId('office-drawer')).toHaveTextContent('To the safe');
    expect(screen.getByTestId('bank-history')).toHaveTextContent('Not deposited yet');
    // The old free-hand moves are gone.
    expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return' })).toBeNull();
  });

  it('an empty box says so', () => {
    m.bags = [];
    renderPage();
    expect(screen.getByTestId('cash-drop-box')).toHaveTextContent('The box is empty');
  });

  it('the office drawer is recounted with the count window', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Recount the office drawer' }));
    await user.click(screen.getAllByRole('button', { name: 'Recount the office drawer' })[1]); // the count window's
    expect(m.audit).toHaveBeenCalledWith({ count: { twenties: 10, fives: 20 }, total: '300.00' });
  });
});
