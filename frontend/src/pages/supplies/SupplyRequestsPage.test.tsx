import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyRequestsPage from './SupplyRequestsPage';

const api = vi.hoisted(() => ({
  getSupplyRequests: vi.fn(),
  getSupplyLists: vi.fn(),
  approveSupplyRequest: vi.fn(),
  declineSupplyRequest: vi.fn(),
}));
vi.mock('../../api/supplies.api', () => api);

const REQ = {
  id: 9, name: 'Zip ties', url: '', note: 'For the racks', photo_url: null, list: 1, list_name: 'Processing',
  requested_by: 'Carrie T', requested_by_id: 4, created_at: '2026-10-28T15:00:00Z', status: 'pending',
  decided_by: '', decided_at: null, decline_reason: '', item: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter><SupplyRequestsPage /></MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SupplyRequestsPage', () => {
  beforeEach(() => {
    api.getSupplyRequests.mockResolvedValue({ can_decide: true, requests: [REQ] });
    api.getSupplyLists.mockResolvedValue({ lists: [{ id: 1, name: 'Processing' }] });
    api.approveSupplyRequest.mockResolvedValue({ ...REQ, status: 'approved' });
    api.declineSupplyRequest.mockResolvedValue({ ...REQ, status: 'declined' });
  });

  it('approves onto a list only with a min and a max', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Approve' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/^Min/), '2');
    await userEvent.type(within(dialog).getByLabelText(/^Max/), '10');
    await userEvent.click(save);
    await waitFor(() => expect(api.approveSupplyRequest).toHaveBeenCalledWith(9, expect.objectContaining({
      list: 1, name: 'Zip ties', min_qty: 2, max_qty: 10,
    })));
  });

  it('declines only with a reason', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Decline' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Why/), 'We have plenty.');
    await userEvent.click(save);
    await waitFor(() => expect(api.declineSupplyRequest).toHaveBeenCalledWith(9, 'We have plenty.'));
  });

  it('shows no buttons to someone who cannot decide', async () => {
    api.getSupplyRequests.mockResolvedValue({ can_decide: false, requests: [REQ] });
    renderPage();
    expect(await screen.findByText('Zip ties')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
