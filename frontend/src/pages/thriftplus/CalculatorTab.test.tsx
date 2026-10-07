import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CalculatorResult, CalculatorRow } from '../../types/thriftplus.types';
import CalculatorTab from './CalculatorTab';

const row = (label: string, items: number): CalculatorRow => ({
  label, items, with_reward: items, with_retail: items, retail_total: 543074.8,
  guest: { total: 201262.22, avg: 10.1, pct_of_retail: 36.6 },
  member: { total: 151719.82, avg: 7.61, pct_of_retail: 27.6 },
  reward_total: 49542.4, pct_off: 24.6,
});

const RESULT: CalculatorResult = {
  params: {
    population: 'counted', launch: '2026-10-20', offset: 0, wait_days: 7, pct_per_day: 1.111, step_days: 1, curve: 'linear',
    floor_share: 0.1, same_slowdown: 0, count_back_stock: true, similar_slowdown: 0, max_slowdown: 75, demand: false,
    demand_strength: 1, max_age: 30, age_factor: 1, max_start_pct: null, start_equivalent: '2026-09-21', on: '2026-10-20',
  },
  source: { population: 'counted', count: { id: 14, name: 'Count Mon 2026-10-05', day: '2026-10-05', counted: 19964 } },
  excluded: { consignment: 3, no_floor_date: 0 },
  totals: row('All items', 19933),
  by_age: [row('Days 1 to 7', 10), row('Over 90 days', 9000)],
  by_band: [row('Under $10', 15000)],
  by_off: [row('No reward', 1)],
  by_category: [row('Toys & games', 2000)],
  timeline: [0, 30, 90].map((offset) => ({ ...row(`Day ${offset}`, 19933), offset, on: '2026-10-20' })),
  rate_changes: { slower: 0, faster: 0, items: 19933 },
  current_settings: { start: null, floor_share: '0.10', switch_on: false },
};

vi.mock('../../api/thriftplus.api', () => ({ fetchCalculator: vi.fn(async () => RESULT) }));

describe('CalculatorTab', () => {
  it('shows guests and members side by side for the last inventory', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CalculatorTab />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Guests')).toBeInTheDocument());
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText(/19,933 items the inventory of Mon 2026-10-05 counted/)).toBeInTheDocument();
    expect(screen.getAllByText('27.6%').length).toBeGreaterThan(0);
    expect(screen.getByText('By age on launch day (real age)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Reset to today's engine" })).toBeInTheDocument();
  });
});
