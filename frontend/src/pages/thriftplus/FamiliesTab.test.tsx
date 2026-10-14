import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bulkApproveFamilies, decideFamily } from '../../api/thriftplus.api';
import type { FamiliesQueue, FamilyRow } from '../../types/thriftplus.types';
import FamiliesTab from './FamiliesTab';

const row = (over: Partial<FamilyRow>): FamilyRow => ({
  id: 1, name: 'Stoneware mug', kind: 'identical', status: 'possible', category: 'Kitchen', products: 1, units: 3, band: '2-3',
  huge: false, tag_total: '18.00', price_avg: '6.00', price_min: '6.00', price_max: '6.00', retail_avg: '15.00', cost_avg: '1.00',
  age_oldest: 20, age_newest: 20, sold_90: 2, sold_180: 4, est_per_90: '13.5', days_to_clear: 20, pct_now: '14.4', suggested_target: 3,
  target_per_90: null, pct: null, decided_by: '', decided_at: null, note: '', flags: [], ...over,
});

const QUEUE: FamiliesQueue = {
  counts: { possible: 2, approved: 0, not_family: 0, exit: 0 },
  units: { possible: 1563, approved: 0, not_family: 0, exit: 0 },
  total: 2, decided: 0, matching: 2, bulk_ok: 1,
  rows: [
    row({}),
    row({ id: 2, name: 'Plastic tumbler', units: 1560, band: '50+', huge: true, suggested_target: 1560,
      flags: [{ key: 'huge', text: 'Huge lot: 1560 units. Decide it on its own.' }] }),
  ],
};

vi.mock('../../api/thriftplus.api', () => ({
  fetchFamilies: vi.fn(async () => QUEUE),
  decideFamily: vi.fn(async () => ({ id: 1, status: 'approved' })),
  bulkApproveFamilies: vi.fn(async () => ({ approved: 1, skipped: 0 })),
  markRestNotFamily: vi.fn(async () => ({ marked: 2 })),
  findFamilies: vi.fn(async () => ({ products: 2, new: 0 })),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { is_superuser: true } }) }));

describe('Families tab (owner 2026-10-13)', () => {
  it('shows the queue with flags, approves with a target, and bulk approves all but huge lots', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FamiliesTab />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('0 of 2 families decided')).toBeInTheDocument();
    const cards = screen.getAllByTestId('family-card');
    expect(within(cards[1]).getByText(/Huge lot: 1560 units/)).toBeInTheDocument();

    const target = within(cards[0]).getByLabelText('Target per 90 days');
    await user.clear(target);
    await user.type(target, '5');
    await user.click(within(cards[0]).getByTestId('family-approve'));
    await waitFor(() => expect(decideFamily).toHaveBeenCalledWith(1, 'approve', 5));

    await user.click(screen.getByTestId('bulk-approve'));
    await waitFor(() => expect(bulkApproveFamilies).toHaveBeenCalledWith([1]));
    expect(screen.getByText(/aren't approved in bulk/)).toBeInTheDocument();
  });
});
