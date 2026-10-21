import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { fetchAiSpend } from '../../api/owner.api';
import OwnerPage, { aiMoney, ownerLinks } from './OwnerPage';

// Desktop (md and up) or phone: the Scorecard is a table on desktop and one period at a time on a phone.
const media = vi.hoisted(() => ({ desktop: true }));
vi.mock('@mui/material', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mui/material')>()),
  useMediaQuery: () => media.desktop,
}));

const period = (key: string, label: string) => ({
  key, label, start: '2026-10-19', end: '2026-10-21',
  net_item_sales: '10000.00', buying: '5400.00', processing: '12000.00',
  buying_pct_of_processing: '45.0', processing_pct_of_sales: '150.0',
  labor_hours: '120.00', labor: '1800.00', labor_pct_of_sales: '18.0', shrink: null,
});

vi.mock('../../api/core.api', () => ({
  getAppErrors: vi.fn(async () => ({ data: {
    open_count: 1, last_24h: 1, last_7d: 3,
    latest: [{ id: 9, source: 'server', message: 'Cart total mismatch', path: '/api/pos/carts/', method: 'POST', user: 'Carrie', version: '2.191.0', seen: false, created_at: '2026-10-21T15:04:00-05:00' }],
  } })),
  markAppErrorsSeen: vi.fn(async () => ({ data: { open_count: 0, last_24h: 1, last_7d: 3, latest: [] } })),
}));

vi.mock('../../api/owner.api', () => ({
  fetchScorecard: vi.fn(async () => ({
    today: '2026-10-21',
    targets: { buying_pct_of_processing: [40, 50], processing_pct_of_sales: 120 },
    periods: [period('this_week', 'This week'), period('last_week', 'Last week'), period('this_month', 'This month'), period('last_month', 'Last month')],
    thrift_plus_owed: { banked: '800.00', credit: '40.00', total: '840.00', trend: [{ day: '2026-10-19', owed: '700.00' }, { day: '2026-10-21', owed: '840.00' }], link: '/thrift-plus' },
  })),
  fetchNeedsYou: vi.fn(async () => ({
    items: [
      { key: 'requests', label: 'Requests to approve', count: 2, link: '/admin/requests', detail: 'Merge vendors', tone: 'warning' },
      { key: 'time_changes', label: 'Time-change requests', count: 0, link: '/admin/time-payroll', detail: '', tone: 'warning' },
    ],
    errors: [],
  })),
  fetchAiSpend: vi.fn(async (range: string) => ({
    range, since: '', total: range === 'month' ? '12.3400' : '0.0040', calls: 3, failed: 0,
    by_feature: [{ feature: 'Processing: item suggestions', sources: ['suggest_item'], cost: '0.0040', calls: 3 }],
    by_who: [{ who: 'Job: run_qa', kind: 'job', cost: '0.0040', calls: 3 }],
  })),
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/owner']}>
      <QueryClientProvider client={new QueryClient()}>
        <OwnerPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Owner page (2026-10-21)', () => {
  it('shows the Scorecard with targets, what is owed and only what is waiting', async () => {
    media.desktop = true;
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Owner' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Scorecard' });
    expect(within(table).getByText('Buying % of processed (target 40-50%)')).toBeInTheDocument();
    expect(within(table).getAllByText('45.0%')).toHaveLength(4);
    expect(within(table).getAllByText('Coming')).toHaveLength(4);
    expect(screen.getByText('$840')).toBeInTheDocument();
    expect(await screen.findByText('Requests to approve')).toBeInTheDocument();
    expect(screen.queryByText('Time-change requests')).not.toBeInTheDocument();
  });

  it('lists the latest site errors and marks them seen', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('New: Cart total mismatch')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark all seen' }));
    expect(await screen.findByText('No errors recorded.')).toBeInTheDocument();
  });

  it('shows a phone one Scorecard period at a time, switched by a tap', async () => {
    media.desktop = false;
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Scorecard' });
    expect(within(list).getByText('45.0%')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Scorecard' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last month' }));
    expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true');
    media.desktop = true;
  });

  it('switches AI spend between today, this week and this month', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findAllByText('<$0.01')).not.toHaveLength(0);
    expect(screen.getByText('Job: run_qa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'This month' }));
    expect(await screen.findByText('$12.34')).toBeInTheDocument();
    expect(fetchAiSpend).toHaveBeenLastCalledWith('month');
  });

  it('links every owner-only page but itself', () => {
    const paths = ownerLinks().map((l) => l.path);
    expect(paths).toEqual(expect.arrayContaining(['/admin/requests', '/thrift-plus', '/reports', '/admin/time-payroll', '/admin/qa']));
    expect(paths).not.toContain('/owner');
    expect(aiMoney('0')).toBe('$0.00');
  });
});
