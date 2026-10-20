import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerPinCard } from './OwnerPinCard';

const api = vi.hoisted(() => ({ getOwnerPin: vi.fn(), setOwnerPin: vi.fn() }));
vi.mock('../../../api/thriftplusReturns.api', () => api);

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <OwnerPinCard />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getOwnerPin.mockReset().mockResolvedValue({ set: false, locked: false });
  api.setOwnerPin.mockReset().mockResolvedValue({ set: true, locked: false });
});

describe('Owner PIN card (Settings, owner 2026-10-20)', () => {
  it('says there is no PIN and sets one: 4 to 8 digits, typed twice, never shown', async () => {
    const user = userEvent.setup();
    renderCard();
    expect(await screen.findByText(/No PIN yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set PIN' }));
    const save = screen.getByRole('button', { name: 'Save PIN' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('New PIN (4 to 8 digits)'), '48');
    await user.type(screen.getByLabelText('Type it again'), '48');
    expect(save).toBeDisabled(); // too short
    await user.type(screen.getByLabelText('New PIN (4 to 8 digits)'), '21');
    expect(save).toBeDisabled(); // the two differ
    expect(screen.getByText('The two do not match.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Type it again'), '21');
    expect(save).toBeEnabled();
    expect(screen.getByLabelText('New PIN (4 to 8 digits)')).toHaveAttribute('type', 'password');
    await user.click(save);
    await waitFor(() => expect(api.setOwnerPin).toHaveBeenCalledWith('4821'));
    await screen.findByRole('button', { name: 'Set PIN' }); // the form closes
  });

  it('keeps only digits and at most 8 of them', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Set PIN' }));
    const box = screen.getByLabelText('New PIN (4 to 8 digits)');
    await user.type(box, '12ab34-5678999');
    expect(box).toHaveValue('12345678');
  });

  it('shows who set it and offers Reset PIN', async () => {
    api.getOwnerPin.mockResolvedValue({ set: true, locked: false, set_by: 'Bill Rollins', set_at: '2026-10-20T15:00:00Z' });
    renderCard();
    expect(await screen.findByText(/A PIN is set by Bill Rollins/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset PIN' })).toBeInTheDocument();
  });

  it('says so when it is locked', async () => {
    api.getOwnerPin.mockResolvedValue({ set: true, locked: true });
    renderCard();
    expect(await screen.findByText(/locked right now/)).toBeInTheDocument();
  });
});
