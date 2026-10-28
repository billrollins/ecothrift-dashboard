import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyReceivePage from './SupplyReceivePage';

const api = vi.hoisted(() => ({ getReceiveLines: vi.fn(), setReceived: vi.fn() }));
vi.mock('../../api/supplies.api', () => api);

const LINE = {
  id: 5, week_start: '2026-10-26', list_name: 'Processing', name: 'Tape', vendor: 'Amazon', url: '', unit: 'roll',
  pack_size: 6, packs: 3, received_qty: 0, received_at: null, received_by: '', status: 'waiting',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter><SupplyReceivePage /></MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SupplyReceivePage', () => {
  beforeEach(() => {
    api.getReceiveLines.mockResolvedValue([LINE]);
    api.setReceived.mockResolvedValue({ ...LINE, received_qty: 3, status: 'in' });
  });

  it('takes all of it, or part of it, with no prices shown', async () => {
    renderPage();
    expect(await screen.findByText('Tape')).toBeInTheDocument();
    expect(screen.getByText(/ordered 3 packs of 6 roll/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All here' }));
    await waitFor(() => expect(api.setReceived).toHaveBeenCalledWith(5, 3));
    const box = screen.getByLabelText('Tape packs in');
    await userEvent.clear(box);
    await userEvent.type(box, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.setReceived).toHaveBeenLastCalledWith(5, 2));
  });

  it('says so when nothing is on its way', async () => {
    api.getReceiveLines.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Nothing on its way/)).toBeInTheDocument();
  });
});
