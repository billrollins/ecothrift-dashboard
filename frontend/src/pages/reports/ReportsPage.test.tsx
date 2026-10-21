import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ReportsPage from './ReportsPage';

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

describe('Reports (owner 2026-10-14): the monthly reports; the brief moved to the Owner page 10-21', () => {
  it('opens on sales tax, under the page title', () => {
    renderAt('/reports');
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sales tax' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Brief' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument();
  });
});
