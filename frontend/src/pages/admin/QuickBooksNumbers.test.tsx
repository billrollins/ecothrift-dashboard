import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayNumbers } from '../../api/hr.api';
import { changeText } from './TimeEntryHistory';
import { QuickBooksNumbers, numbersAsText } from './QuickBooksNumbers';

const hr = vi.hoisted(() => ({
  getPayNumbers: vi.fn(),
  closePayPeriod: vi.fn(),
  reopenPayPeriod: vi.fn(),
  payNumbersCsvUrl: (d: string) => `/hr/pay-periods/numbers/?date_from=${d}&download=csv`,
}));
vi.mock('../../api/hr.api', () => hr);
vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }));

const NUMBERS: PayNumbers = {
  date_from: '2026-09-28', date_to: '2026-10-11', label: 'Sep 28 - Oct 11, 2026', overtime_multiplier: '1.50',
  closed: false, closed_at: null, closed_by: '', reopened_at: null, reopened_by: '',
  rows: [{
    employee_id: 1, name: 'Ashley K', employee_number: 'EMP-001', rate: '20.00', overtime_rate: '30.00',
    regular_hours: '76.00', overtime_hours: '5.00', regular_pay: '1520.00', overtime_pay: '150.00', gross: '1670.00',
    shifts: 9, open_shifts: 0, pending_shifts: 2,
  }],
  totals: { regular_hours: '76.00', overtime_hours: '5.00', regular_pay: '1520.00', overtime_pay: '150.00', gross: '1670.00' },
};

const PERIODS = [
  { date_from: '2026-10-12', date_to: '2026-10-25', label: 'Oct 12 - 25, 2026', is_current: true },
  { date_from: '2026-09-28', date_to: '2026-10-11', label: 'Sep 28 - Oct 11, 2026', is_current: false },
];

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <QuickBooksNumbers periods={PERIODS} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('QuickBooksNumbers', () => {
  beforeEach(() => {
    hr.getPayNumbers.mockReset().mockResolvedValue({ data: NUMBERS });
    hr.closePayPeriod.mockReset().mockResolvedValue({ data: { closed: true } });
  });

  it('opens on the last finished period and shows each person', async () => {
    renderIt();
    expect(await screen.findByText('Ashley K')).toBeInTheDocument();
    expect(hr.getPayNumbers).toHaveBeenCalledWith('2026-09-28');
    expect(screen.getAllByText('$1,670.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 shifts are not approved yet/)).toBeInTheDocument();
  });

  it('copies as columns', () => {
    expect(numbersAsText(NUMBERS)).toBe(
      'Employee\tRegular hours\tOvertime hours\tRate\tOvertime rate\tGross\nAshley K\t76.00\t5.00\t20.00\t30.00\t1670.00',
    );
  });

  it('closes the period after asking', async () => {
    const user = userEvent.setup();
    renderIt();
    await screen.findByText('Ashley K');
    await user.click(screen.getByRole('button', { name: 'Close period' }));
    const buttons = await screen.findAllByRole('button', { name: 'Close period' });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(hr.closePayPeriod).toHaveBeenCalledWith('2026-09-28'));
  });
});

describe('changeText', () => {
  it('names only what changed', () => {
    expect(changeText({
      action: 'edited', label: 'Edited', at: '2026-10-01T12:00:00Z', by: 'Bill', note: '',
      before: { break_minutes: 0, total_hours: '8.00', status: 'pending' },
      after: { break_minutes: 30, total_hours: '7.50', status: 'pending' },
    })).toBe('Break 0 min to 30 min, Hours 8.00 to 7.50');
  });
});
