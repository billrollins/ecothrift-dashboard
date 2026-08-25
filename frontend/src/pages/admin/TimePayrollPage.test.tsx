import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import TimePayrollPage from './TimePayrollPage';

const roster = [
  {
    id: 1,
    employee_id: 9,
    employee_name: 'Ada Lovelace',
    date: '2026-08-17',
    clock_in: '2026-08-17T09:00:00Z',
    clock_out: '2026-08-17T18:00:00Z',
    break_minutes: 0,
    break_label: '—',
    on_break: false,
    total_hours: '30.00',
    pay_rate: '15.00',
    pay: '450.00',
    week_start: '2026-08-17',
    week_end: '2026-08-23',
    weekly_cumulative_hours: '30.00',
    is_open: false,
  },
  {
    id: 2,
    employee_id: 9,
    employee_name: 'Ada Lovelace',
    date: '2026-08-24',
    clock_in: '2026-08-24T09:00:00Z',
    clock_out: '2026-08-24T18:00:00Z',
    break_minutes: 0,
    break_label: '—',
    on_break: false,
    total_hours: '45.00',
    pay_rate: '15.00',
    pay: '675.00',
    week_start: '2026-08-24',
    week_end: '2026-08-30',
    weekly_cumulative_hours: '45.00',
    is_open: false,
  },
];

vi.mock('@mui/x-date-pickers/DatePicker', () => ({
  DatePicker: () => <div data-testid="date-picker-stub" />,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: () => <div data-testid="data-grid-stub" />,
}));

vi.mock('../../hooks/useEmployees', () => ({
  useUsers: () => ({ data: { results: [] } }),
}));

vi.mock('../../api/hr.api', () => ({
  getPayrollPeriods: async () => ({
    data: [
      {
        date_from: '2026-08-17',
        date_to: '2026-08-30',
        label: 'Aug 17 – 30, 2026',
        is_current: true,
      },
    ],
  }),
  getTimeEntryRoster: async () => ({ data: roster }),
  getModificationRequests: async () => ({ data: { results: [], count: 0 } }),
  approveModificationRequest: vi.fn(),
  bulkApproveModificationRequests: vi.fn(),
  bulkDeleteModificationRequests: vi.fn(),
  bulkRejectModificationRequests: vi.fn(),
  bulkDeleteTimeEntries: vi.fn(),
  createTimeEntry: vi.fn(),
  denyModificationRequest: vi.fn(),
  updateModificationRequest: vi.fn(),
  updateTimeEntry: vi.fn(),
}));

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <TimePayrollPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('TimePayrollPage By employee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses Employee, Shifts, Rate, Ind. weeks, Time, Payroll', async () => {
    const user = userEvent.setup();
    wrap();

    await user.click(await screen.findByRole('tab', { name: 'By employee' }));

    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent);
    expect(headers).toEqual(['Employee', '# Shifts', 'Rate', 'Ind. weeks', 'Time', 'Payroll']);
    expect(headers.join('|')).not.toContain('This week');
    expect(headers.join('|')).not.toContain('This payroll');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getAllByText('Regular').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Overtime').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('70.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('5.00').length).toBeGreaterThanOrEqual(1);
  });
});
