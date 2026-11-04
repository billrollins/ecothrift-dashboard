import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import HrRequests from './HrRequests';

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'Employee', is_superuser: false, access: [] as string[] } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../i18n/useLanguage', () => ({ useLanguage: () => 'en' }));

const schedRow = (id: number, employee: number, status: string) => ({
  id, employee, employee_name: employee === 1 ? 'Carrie T' : 'Dave T', kind: 'off', date: '2026-11-10',
  end_date: '2026-11-10', start_time: null, end_time: null, note: 'Dentist', status, reply: status === 'approved' ? 'OK' : '',
  decided_by_name: status === 'approved' ? 'Mandy M' : '', decided_at: null, created_at: `2026-11-0${id}T10:00:00Z`,
});
vi.mock('../../api/schedule.api', () => ({
  getScheduleRequests: vi.fn(async () => ({ data: [schedRow(1, 1, 'approved'), schedRow(2, 2, 'pending')] })),
}));
vi.mock('../../api/hr.api', () => ({
  getModificationRequests: vi.fn(async () => ({ data: { results: [{
    id: 7, time_entry: 3, employee: 1, employee_name: 'Carrie T', entry_date: '2026-11-02',
    entry_clock_in: '2026-11-02T15:00:00Z', entry_clock_out: null, requested_clock_in: '2026-11-02T15:00:00Z',
    requested_clock_out: '2026-11-02T23:00:00Z', requested_break_minutes: null, reason: 'Forgot to clock out',
    status: 'pending', reviewed_by: null, reviewed_by_name: null, review_note: '', reviewed_at: null,
    created_at: '2026-11-03T10:00:00Z',
  }] } })),
  getHrQuestions: vi.fn(async () => ({ data: [
    { id: 5, employee: 2, employee_name: 'Dave T', question: 'When is payday?', status: 'open', answer: '',
      answered_by_name: '', answered_at: null, created_at: '2026-11-04T10:00:00Z' },
  ] })),
  askHrQuestion: vi.fn(),
  answerHrQuestion: vi.fn(),
  approveModificationRequest: vi.fn(),
  denyModificationRequest: vi.fn(),
}));

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><SnackbarProvider><HrRequests /></SnackbarProvider></QueryClientProvider>,
  );
}

describe('HR Requests', () => {
  it('staff see only their own requests of every kind, newest first, and nothing to answer', async () => {
    auth.user = { id: 1, role: 'Employee', is_superuser: false, access: [] };
    renderIt();
    await screen.findByTestId('my-t7');
    const mine = screen.getAllByTestId(/^my-/).map((el) => el.dataset.testid);
    expect(mine).toEqual(['my-t7', 'my-s1']);
    expect(within(screen.getByTestId('my-s1')).getByText('Mandy M: OK')).toBeInTheDocument();
    expect(screen.queryByText(/Waiting on you/)).toBeNull();
  });

  it('a schedule manager who answers questions sees those waiting, not time changes', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write', 'hr.questions:answer'] };
    renderIt();
    expect(await screen.findByText('Waiting on you (2)')).toBeInTheDocument();
    expect(screen.getByTestId('request-2')).toBeInTheDocument();
    expect(screen.getByTestId('question-5')).toBeInTheDocument();
    expect(screen.queryByTestId('timechange-7')).toBeNull();
  });

  it('the owner also approves time changes here', async () => {
    auth.user = { id: 9, role: 'Admin', is_superuser: true, access: [] };
    renderIt();
    expect(await screen.findByText('Waiting on you (3)')).toBeInTheDocument();
    expect(screen.getByTestId('timechange-7')).toBeInTheDocument();
  });
});
