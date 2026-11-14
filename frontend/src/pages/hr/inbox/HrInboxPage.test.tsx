import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HrInboxPage from './HrInboxPage';
import { buildInbox } from './useHrInbox';

const auth = vi.hoisted(() => ({ user: { id: 9, role: 'Manager', is_superuser: false, access: [] as string[] } }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../../i18n/useLanguage', () => ({ useLanguage: () => 'en' }));
vi.mock('../../../components/users/SignInTrouble', () => ({ SignInTroubleBar: () => <div data-testid="sign-in-trouble-bar" /> }));

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const sched = (id: number, employee: number, status: string, extra = {}) => ({
  id, employee, employee_name: employee === 9 ? 'Mandy M' : 'Dave T', kind: 'off', date: '2026-11-20', end_date: '2026-11-21',
  start_time: null, end_time: null, note: 'Wedding', status, reply: status === 'approved' ? 'Have fun' : '',
  decided_by_name: status === 'pending' ? '' : 'Mandy M', decided_at: status === 'pending' ? null : days(1), created_at: days(3), ...extra,
});

const api = vi.hoisted(() => ({
  getScheduleRequests: vi.fn(),
  decideScheduleRequest: vi.fn(),
  getModificationRequests: vi.fn(),
  approveModificationRequest: vi.fn(),
  denyModificationRequest: vi.fn(),
  getHrQuestions: vi.fn(),
  answerHrQuestion: vi.fn(),
  getIncidents: vi.fn(),
  addIncidentNote: vi.fn(),
  setIncidentStatus: vi.fn(),
}));
vi.mock('../../../api/schedule.api', () => ({
  getScheduleRequests: api.getScheduleRequests,
  decideScheduleRequest: api.decideScheduleRequest,
}));
vi.mock('../../../api/hr.api', () => ({
  getModificationRequests: api.getModificationRequests,
  approveModificationRequest: api.approveModificationRequest,
  denyModificationRequest: api.denyModificationRequest,
  getHrQuestions: api.getHrQuestions,
  answerHrQuestion: api.answerHrQuestion,
}));
vi.mock('../../../api/incidents.api', () => ({
  getIncidents: api.getIncidents,
  addIncidentNote: api.addIncidentNote,
  setIncidentStatus: api.setIncidentStatus,
}));

const FIX = {
  id: 7, time_entry: 3, employee: 4, employee_name: 'Carrie T', entry_date: '2026-11-10',
  entry_clock_in: '2026-11-10T15:00:00Z', entry_clock_out: null, requested_clock_in: '2026-11-10T15:00:00Z',
  requested_clock_out: '2026-11-10T23:00:00Z', requested_break_minutes: 30, reason: 'Forgot to clock out',
  status: 'pending', reviewed_by: null, reviewed_by_name: null, review_note: '', reviewed_at: null, created_at: days(5),
};
const INCIDENT = {
  id: 12, occurred_at: days(2), kind: 'fall', kind_label: 'Fall or slip', place: 'stairs', place_label: 'Stairs', place_detail: '',
  people: [], what_happened: 'A customer slipped on the back stairs.', injuries: '', first_aid: false, called_911: false,
  status: 'open', reported_by: 9, reported_by_name: 'Mandy M', created_at: days(2), closed_by_name: '', closed_at: null,
  photo_count: 0, note_count: 0,
};
const QUESTION = {
  id: 5, employee: 6, employee_name: 'Dave T', question: 'When is payday?', status: 'open', answer: '',
  answered_by_name: '', answered_at: null, created_at: days(1),
};

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}><SnackbarProvider><HrInboxPage /></SnackbarProvider></QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getScheduleRequests.mockResolvedValue({ data: [sched(1, 6, 'pending'), sched(2, 9, 'pending'), sched(3, 6, 'approved')] });
  api.getModificationRequests.mockResolvedValue({ data: { results: [FIX] } });
  api.getHrQuestions.mockResolvedValue({ data: [QUESTION] });
  api.getIncidents.mockResolvedValue({ data: { can_manage: true, reports: [INCIDENT] } });
  api.decideScheduleRequest.mockResolvedValue({ data: {} });
  api.approveModificationRequest.mockResolvedValue({ data: {} });
  api.answerHrQuestion.mockResolvedValue({ data: {} });
  api.addIncidentNote.mockResolvedValue({ data: {} });
  api.setIncidentStatus.mockResolvedValue({ data: {} });
});

describe('HR > Requests, the managers’ inbox (#140)', () => {
  it('a manager sees days off, incidents and questions, the longest waiting first; never their own; no shift fixes', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write', 'hr.questions:answer', 'people:manage'] };
    renderIt();
    await screen.findByTestId('inbox-row-i12');
    await waitFor(() => expect(screen.getAllByTestId(/^inbox-row-/)).toHaveLength(3));
    expect(screen.getAllByTestId(/^inbox-row-/).map((el) => el.dataset.testid)).toEqual(['inbox-row-s1', 'inbox-row-i12', 'inbox-row-q5']);
    // Shift fixes are the owner's: never asked for.
    expect(api.getModificationRequests).not.toHaveBeenCalled();
    expect(screen.getByTestId('inbox-view-waiting')).toHaveTextContent('Waiting (3)');
    expect(within(screen.getByTestId('inbox-row-i12')).getByTestId('inbox-open-i12')).toHaveAttribute('href', '/people/incidents?report=12');
    // Who is locked out (#121) moved here with the answering.
    expect(screen.getByTestId('sign-in-trouble-bar')).toBeInTheDocument();
  });

  it('approves a day off with the reply typed in place', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write', 'hr.questions:answer', 'people:manage'] };
    renderIt();
    const row = await screen.findByTestId('inbox-row-s1');
    await userEvent.type(within(row).getByLabelText('Reply (optional)'), 'Have fun');
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.decideScheduleRequest).toHaveBeenCalledWith(1, true, 'Have fun'));
  });

  it('answers a question, adds a note to an incident and closes it', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write', 'hr.questions:answer', 'people:manage'] };
    renderIt();
    const question = await screen.findByTestId('inbox-row-q5');
    const send = within(question).getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.type(within(question).getByLabelText('Your answer'), 'Every other Friday');
    await userEvent.click(send);
    await waitFor(() => expect(api.answerHrQuestion).toHaveBeenCalledWith(5, 'Every other Friday'));

    const incident = screen.getByTestId('inbox-row-i12');
    await userEvent.type(within(incident).getByLabelText('Follow-up note'), 'Called the customer');
    await userEvent.click(within(incident).getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(api.addIncidentNote).toHaveBeenCalledWith(12, 'Called the customer'));
    await userEvent.click(within(incident).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(api.setIncidentStatus).toHaveBeenCalledWith(12, 'close', ''));
  });

  it('the owner also approves shift fixes here', async () => {
    auth.user = { id: 1, role: 'Admin', is_superuser: true, access: [] };
    renderIt();
    const fix = await screen.findByTestId('inbox-row-t7');
    expect(fix).toHaveTextContent('Punched');
    expect(fix).toHaveTextContent('Forgot to clock out');
    await userEvent.click(within(fix).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.approveModificationRequest).toHaveBeenCalledWith(7, ''));
  });

  it('Answered lists the last 30 days with who answered', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write', 'people:manage'] };
    renderIt();
    await screen.findByTestId('inbox-row-s1');
    await userEvent.click(screen.getByTestId('inbox-view-answered'));
    const row = await screen.findByTestId('inbox-row-s3');
    expect(row).toHaveTextContent('Approved');
    expect(row).toHaveTextContent('Mandy M');
    expect(row).toHaveTextContent('Have fun');
  });

  it('nothing waiting says so', async () => {
    auth.user = { id: 9, role: 'Manager', is_superuser: false, access: ['hr.schedule:write'] };
    api.getScheduleRequests.mockResolvedValue({ data: [] });
    api.getIncidents.mockResolvedValue({ data: { can_manage: true, reports: [] } });
    renderIt();
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
  });
});

describe('buildInbox', () => {
  it('leaves out my own requests and withdrawn ones, and answers older than 30 days', () => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    const old = { ...sched(4, 6, 'declined'), decided_at: '2026-09-01T10:00:00Z' };
    const { waiting, answered } = buildInbox(
      { schedule: [sched(1, 6, 'pending'), sched(2, 9, 'pending'), sched(5, 6, 'withdrawn'), old] as never },
      9,
      now,
    );
    expect(waiting.map((r) => r.key)).toEqual(['s1']);
    expect(answered).toEqual([]);
  });
});
