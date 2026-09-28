import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QAPage from './QAPage';

vi.mock('../../api/qa.api', () => ({
  fetchQaLatest: async () => ({
    running: false,
    run: {
      id: 3, started_at: '2026-10-21T07:00:00Z', finished_at: '2026-10-21T07:01:00Z', error: '', triage_model: 'claude-opus-5-5',
      triage: { headline: 'Two floor items are priced $0.', notes: [{ check_id: 'ITM-07', verdict: 'worse', note: 'Reprice them.' }] },
      findings: [
        { check_id: 'PO-01', title: 'Open POs older than 120 days', severity: 'low', stage: 'order', handling: 'count as processed',
          count: 0, previous: 0, delta: 0, sample: [], error: '', fix_kind: '' },
        { check_id: 'ITM-07', title: 'On-floor items priced $0', severity: 'high', stage: 'items', handling: 'flag',
          count: 2, previous: 1, delta: 1, sample: [{ sku: 'ITM0000001' }], error: '', fix_kind: '' },
      ],
    },
  }),
  fetchQaHistory: async () => [{ day: '2026-10-20', count: 1 }, { day: '2026-10-21', count: 2 }],
  runQaNow: async () => ({ started: true }),
}));

describe('Data QA', () => {
  it('shows the triage, puts checks with rows first, and opens one to its sample and history', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={createTheme()}>
        <QueryClientProvider client={client}>
          <QAPage />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Two floor items are priced $0.')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ITM-07');
    expect(screen.getByText('+1')).toBeInTheDocument();
    await user.click(screen.getByText('On-floor items priced $0'));
    expect(await screen.findByText(/Reprice them/)).toBeInTheDocument();
    expect(await screen.findByText('Last 2 runs: 1, 2')).toBeInTheDocument();
  });
});
