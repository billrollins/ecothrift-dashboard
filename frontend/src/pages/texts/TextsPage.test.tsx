import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextsPage from './TextsPage';

const api = vi.hoisted(() => ({
  getInbox: vi.fn(),
  getThread: vi.fn(),
  replyToThread: vi.fn(),
}));

vi.mock('../../api/texting.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/texting.api')>()),
  ...api,
}));
vi.mock('../../components/common/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const conversation = {
  phone: '4028675309', name: 'Ana Test', user_id: 2, kind: 'staff', last_body: 'Running late', last_at: '2026-11-13T15:00:00Z',
  unread: 1, count: 1, stopped: false,
};
const thread = {
  phone: '4028675309', name: 'Ana Test', user_id: 2, kind: 'staff', stopped: false, replies_live: false,
  waiting_on: ['the Eco-Thrift Twilio key'],
  messages: [{ id: 'in-1', from: 'them', body: 'Running late', at: '2026-11-13T15:00:00Z', keyword: '', media: 0, read: true }],
};

function renderPage(path = '/texts') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TextsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TextsPage (#132)', () => {
  beforeEach(() => {
    api.getInbox.mockResolvedValue({ data: { conversations: [conversation], unread: 1 } });
    api.getThread.mockResolvedValue({ data: thread });
    api.replyToThread.mockResolvedValue({
      data: {
        ...thread,
        message: { id: 'out-1', from: 'us', body: 'Eco-Thrift: ok', at: '2026-11-13T15:01:00Z', status: 'held', status_label: 'Held (texting not live)', reason: 'Waiting' },
      },
    });
  });

  it('lists who texted, opens the conversation, and says replies are held until live', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ana Test'));
    expect(await screen.findByTestId('texts-thread')).toHaveTextContent('Running late');
    expect(screen.getByText(/do not go out yet/)).toHaveTextContent('the Eco-Thrift Twilio key');
    await user.type(screen.getByTestId('texts-reply'), 'ok');
    await user.click(screen.getByTestId('texts-send'));
    await waitFor(() => expect(api.replyToThread).toHaveBeenCalledWith('4028675309', 'ok'));
  });

  it('cannot reply to a number that said STOP', async () => {
    api.getThread.mockResolvedValue({ data: { ...thread, stopped: true } });
    renderPage('/texts?n=4028675309');
    expect(await screen.findByText(/They replied STOP/)).toBeInTheDocument();
    expect(screen.queryByTestId('texts-reply')).not.toBeInTheDocument();
  });

  it('says so when nobody has texted yet', async () => {
    api.getInbox.mockResolvedValue({ data: { conversations: [], unread: 0 } });
    renderPage();
    expect(await screen.findByTestId('texts-empty')).toBeInTheDocument();
  });
});
