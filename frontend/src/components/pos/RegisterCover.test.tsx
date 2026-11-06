import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Drawer } from '../../types/pos.types';
import { useRegisterCover } from './RegisterCover';

const m = vi.hoisted(() => ({ cover: vi.fn(), back: vi.fn(), spot: vi.fn(), accept: vi.fn() }));
vi.mock('../../api/pos.api', () => ({ coverDrawer: m.cover, endDrawerCover: m.back, spotCheck: m.spot, acceptCover: m.accept }));

function apiError(data: Record<string, unknown>) {
  return Object.assign(new Error('http'), { response: { data } });
}

const DRAWER = {
  id: 7, register: 1, status: 'open', current_cashier: 3, current_cashier_name: 'Cara Cashier', cover: null,
} as unknown as Drawer;

const COVERED = {
  ...DRAWER,
  cover: {
    id: 1, user: 4, user_name: 'Dee Next', cashier: 3, cashier_name: 'Cara Cashier',
    started_at: new Date().toISOString(), idle_ends_at: new Date(Date.now() + 600000).toISOString(),
  },
} as Drawer;

function Harness({ drawer }: { drawer: Drawer | null }) {
  const { button, banner, dialog } = useRegisterCover(drawer);
  return (
    <>
      {button}
      {banner}
      {dialog}
    </>
  );
}

function renderWith(drawer: Drawer | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness drawer={drawer} />
    </QueryClientProvider>,
  );
}

describe('Cover at the register (2026-10-22)', () => {
  it('the person stepping in types their own PIN; a wrong one says so and keeps asking', async () => {
    const user = userEvent.setup();
    m.cover.mockReset();
    m.cover
      .mockRejectedValueOnce(apiError({ code: 'PIN_WRONG', detail: 'That PIN is wrong.', tries_left: 4 }))
      .mockResolvedValueOnce({ data: COVERED });
    renderWith(DRAWER);
    await user.click(screen.getByTestId('cover-button'));
    expect(screen.getByText(/Stepping in for Cara Cashier\?/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your register PIN'), '1357');
    expect(screen.getByRole('button', { name: 'Cover' })).toBeDisabled(); // they take the drawer on first (#70)
    await user.click(screen.getByTestId('cover-accept'));
    await user.type(screen.getByLabelText('Your register PIN'), '{Enter}');
    expect(await screen.findByText('That PIN is wrong. 4 tries left.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your register PIN'), '3579');
    await user.click(screen.getByRole('button', { name: 'Cover' }));
    await waitFor(() => expect(m.cover).toHaveBeenLastCalledWith(7, '3579'));
    await waitFor(() => expect(screen.queryByTestId('cover-dialog')).toBeNull());
  });

  it('while covered: the banner names who, and Back asks for the drawer\'s cashier\'s PIN', async () => {
    const user = userEvent.setup();
    m.back.mockReset();
    m.back.mockResolvedValueOnce({ data: DRAWER });
    renderWith(COVERED);
    expect(screen.queryByTestId('cover-button')).toBeNull();
    const banner = screen.getByTestId('cover-banner');
    expect(banner).toHaveTextContent('Covered by Dee Next');
    expect(banner).toHaveTextContent('Sales go to Dee.');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText("Back: Cara Cashier's PIN")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Cara's PIN"), '2468{Enter}');
    await waitFor(() => expect(m.back).toHaveBeenCalledWith(7, '2468'));
  });

  it('no open drawer, no Cover', () => {
    renderWith(null);
    expect(screen.queryByTestId('cover-button')).toBeNull();
    expect(screen.queryByTestId('cover-banner')).toBeNull();
  });

  it('after Back: the cash moved, a count of just what changed, then Accept the drawer (#70)', async () => {
    const user = userEvent.setup();
    m.back.mockReset();
    m.spot.mockReset();
    m.accept.mockReset();
    m.accept.mockResolvedValueOnce({ data: { accepted_at: '2026-11-05T15:10:00Z', by: 'Cara Cashier' } });
    m.back.mockResolvedValueOnce({ data: { ...DRAWER, cover_report: {
      cover: 1, covered_by: 'Dee Next', started_at: '2026-11-05T15:00:00Z', ended_at: '2026-11-05T15:08:00Z',
      sales: [{ at: '2026-11-05T15:02:00Z', receipt: 'R-20261105-012', total: '37.00', cash: '40.00', change: '3.00' }],
      drops: [], movements: [], changed: { twenties: 2, ones: -3 },
    } } });
    m.spot.mockResolvedValueOnce({ data: { count_check: {
      rows: [{ key: 'twenties', label: '$20', counted: 7, expected: 7, difference: 0 },
        { key: 'ones', label: '$1', counted: 17, expected: 17, difference: 0 }],
      counted_total: '157.00', expected_total: '157.00', difference_total: '0.00',
    } } });
    renderWith(COVERED);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(screen.getByLabelText("Cara's PIN"), '2468{Enter}');
    expect(await screen.findByTestId('spot-changed')).toHaveTextContent('While Dee covered, these changed: $20 +2 · $1 −3');
    expect(screen.getByTestId('cover-lines')).toHaveTextContent('Sale R-20261105-012 · $37.00 · cash in $40.00, change $3.00');
    expect(screen.queryByTestId('count-tens')).toBeNull();
    await user.type(screen.getByTestId('count-twenties'), '7');
    await user.type(screen.getByTestId('count-ones'), '17');
    await user.click(screen.getByTestId('count-submit'));
    expect(m.spot).toHaveBeenCalledWith(7, 1, { twenties: 7, ones: 17 });
    expect(await screen.findByTestId('count-result')).toHaveTextContent('Right on');
    await user.click(screen.getByTestId('cover-accept-back'));
    await waitFor(() => expect(m.accept).toHaveBeenCalledWith(7, 1));
    await waitFor(() => expect(screen.queryByTestId('count-result')).toBeNull());
  });

  it('with no cash moved it still asks the cashier to accept the drawer', async () => {
    const user = userEvent.setup();
    m.back.mockReset();
    m.accept.mockReset();
    m.accept.mockResolvedValueOnce({ data: { accepted_at: '2026-11-05T15:10:00Z', by: 'Cara Cashier' } });
    m.back.mockResolvedValueOnce({ data: { ...DRAWER, cover_report: {
      cover: 2, covered_by: 'Dee Next', started_at: '2026-11-05T15:00:00Z', ended_at: '2026-11-05T15:04:00Z',
      sales: [], drops: [], movements: [], changed: {},
    } } });
    renderWith(COVERED);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(screen.getByLabelText("Cara's PIN"), '2468{Enter}');
    expect(await screen.findByText('No cash moved while Dee covered.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('cover-back-dialog')).toBeInTheDocument(); // it ends only with Accept
    await user.click(screen.getByTestId('cover-accept-back'));
    await waitFor(() => expect(m.accept).toHaveBeenCalledWith(7, 2));
    await waitFor(() => expect(screen.queryByTestId('cover-back-dialog')).toBeNull());
  });
});
