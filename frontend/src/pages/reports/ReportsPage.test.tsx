import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ReportsPage from './ReportsPage';

vi.mock('../../api/brief.api', () => ({
  fetchDailyBrief: vi.fn(async () => ({
    day: '2026-10-13', writing: false, snapshot: null, days: ['2026-10-13'],
    brief: { status: 'ready', body: { headline: 'A steady Monday' }, model_used: 'test', error: '', finished_at: null },
  })),
  writeDailyBrief: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({ fetchSalesTax: vi.fn(() => new Promise(() => undefined)) }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Reports (owner 2026-10-14): the brief first, then sales tax', () => {
  it('opens on the morning brief, under the page title', async () => {
    renderAt('/reports');
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByText('A steady Monday')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Morning brief' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Brief' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to sales tax', async () => {
    const user = userEvent.setup();
    renderAt('/reports');
    await user.click(screen.getByRole('tab', { name: 'Sales tax' }));
    expect(screen.getByRole('tab', { name: 'Sales tax' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument();
  });
});
