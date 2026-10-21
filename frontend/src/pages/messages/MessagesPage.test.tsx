import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Thread, ThreadRow } from '../../api/messages.api';
import MessagesPage, { readLine } from './MessagesPage';

const api = vi.hoisted(() => ({
  getThreads: vi.fn(),
  getThread: vi.fn(),
  getAudiences: vi.fn(),
  getUnread: vi.fn(),
  replyToThread: vi.fn(),
  startThread: vi.fn(),
  showSecret: vi.fn(),
}));
vi.mock('../../api/messages.api', () => api);
const auth = vi.hoisted(() => ({ user: { is_superuser: false, role: 'Employee' } as { is_superuser: boolean; role: string } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

function setWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('min-width'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const ROWS: ThreadRow[] = [
  { id: 7, subject: 'Your register PIN', audience: 'Carrie T', started_by: 'Bill R', last_message_at: '2026-10-21T15:00:00Z', unread: 1, preview: 'Your register PIN is in the box below', preview_from: 'Bill R' },
  { id: 8, subject: 'Truck Friday', audience: 'Retail', started_by: 'Bill R', last_message_at: '2026-10-20T15:00:00Z', unread: 0, preview: 'All hands', preview_from: 'Bill R' },
];

const PIN_THREAD: Thread = {
  id: 7, subject: 'Your register PIN', audience: 'Carrie T', started_by: 'Bill R',
  members: [{ id: 1, name: 'Bill R' }, { id: 2, name: 'Carrie T' }],
  messages: [{
    id: 70, body: 'Your register PIN is in the box below: tap Show to see it.', created_at: '2026-10-21T15:00:00Z',
    sender: 'Bill R', sender_id: 1, mine: false, read_by: [],
    secret: { state: 'waiting', for: 'Carrie T', shown_at: null, can_show: true },
  }],
};

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:id" element={<MessagesPage />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('MessagesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getThreads.mockResolvedValue({ data: ROWS });
    api.getThread.mockResolvedValue({ data: PIN_THREAD });
    auth.user = { is_superuser: false, role: 'Employee' };
    setWide(true);
  });

  it('on a desk shows the list beside the open thread; staff cannot start one', async () => {
    renderAt('/messages/7');
    expect(await screen.findByText('Truck Friday')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(await screen.findByTestId('message-thread')).toHaveTextContent('tap Show');
    expect(screen.queryByRole('button', { name: 'New message' })).toBeNull();
  });

  it('shows a one-time secret once, then says it is gone', async () => {
    const user = userEvent.setup();
    api.showSecret.mockResolvedValue({ data: { secret: '4071' } });
    renderAt('/messages/7');
    const box = await screen.findByTestId('secret-70');
    await user.click(within(box).getByRole('button', { name: 'Show' }));
    expect(await screen.findByTestId('secret-value')).toHaveTextContent('4071');
    expect(api.showSecret).toHaveBeenCalledWith(70);
    expect(screen.getByText(/only time it shows/)).toBeInTheDocument();
  });

  it('on a phone shows the list, then the thread with a back arrow', async () => {
    setWide(false);
    const user = userEvent.setup();
    renderAt('/messages');
    await user.click(await screen.findByTestId('thread-7'));
    expect(await screen.findByTestId('message-thread')).toBeInTheDocument();
    expect(screen.queryByTestId('message-list')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to messages' }));
    expect(await screen.findByTestId('message-list')).toBeInTheDocument();
  });

  it('a manager starts a message with an optional secret to one person', async () => {
    auth.user = { is_superuser: false, role: 'Manager' };
    const user = userEvent.setup();
    api.getAudiences.mockResolvedValue({ data: { people: [{ id: 2, name: 'Carrie T' }], departments: [{ id: 5, name: 'Retail' }] } });
    api.startThread.mockResolvedValue({ data: { ...PIN_THREAD, id: 9 } });
    renderAt('/messages');
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Carrie T' }));
    await user.type(screen.getByLabelText('Subject'), 'Wifi');
    await user.type(screen.getByLabelText('Message'), 'Office wifi below.');
    await user.type(screen.getByLabelText(/One-time secret/), 'green-fern');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.startThread).toHaveBeenCalledWith({
      subject: 'Wifi', body: 'Office wifi below.', to_user: 2, secret: 'green-fern',
    }));
  });

  it('says who read my message', () => {
    expect(readLine({ ...PIN_THREAD.messages[0], read_by: [] })).toBe('Not read yet');
    expect(readLine({ ...PIN_THREAD.messages[0], read_by: [{ name: 'Carrie T', at: '2026-10-01T15:04:00Z' }] }))
      .toMatch(/^Read by Carrie Oct 1, /);
  });
});
