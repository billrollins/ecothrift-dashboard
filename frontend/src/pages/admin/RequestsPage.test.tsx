import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { ApprovalRequest } from '../../types/approvalRequests.types';
import RequestsPage from './RequestsPage';

const calls = vi.hoisted(() => ({ approve: [] as Array<[number, string]> }));

const pending: ApprovalRequest = {
  id: 4,
  kind: 'inventory.seed_brand_aliases',
  kind_label: 'Add brand aliases',
  title: 'Add 1,814 brand aliases',
  summary: 'Brand spellings from the R-023 clusters.',
  preview: {
    counts: { 'New aliases': 1814, 'Marked junk (brand becomes blank)': 274 },
    changes: ['Adds 1,814 brand spellings, each mapped to its canonical brand (R-023 clusters).'],
    sample: [{ spelling: 'up & up', brand: 'up&up', junk: false }],
  },
  status: 'pending',
  requested_by: 'claude:data_platform',
  decided_by_name: '',
  decided_at: null,
  decision_note: '',
  started_at: null,
  heartbeat_at: null,
  finished_at: null,
  progress: {},
  log: '',
  result: {},
  error: '',
  undone_at: null,
  can_undo: false,
  stale: false,
  created_at: '2026-09-28T14:00:00Z',
};

vi.mock('../../api/approvalRequests.api', () => ({
  fetchApprovalRequests: async () => [pending],
  approveRequest: async (id: number, note: string) => {
    calls.approve.push([id, note]);
    return { ...pending, status: 'approved' };
  },
  rejectRequest: async () => pending,
  undoRequest: async () => pending,
  resumeRequest: async () => pending,
}));

describe('Superuser Requests', () => {
  it('shows the evidence of a waiting request and approves it with a note', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={createTheme()}>
        <QueryClientProvider client={client}>
          <SnackbarProvider>
            <RequestsPage />
          </SnackbarProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Add 1,814 brand aliases' })).toBeInTheDocument();
    expect(screen.getByText('1,814')).toBeInTheDocument();
    expect(screen.getByText('up&up')).toBeInTheDocument();
    expect(screen.getByText(/each mapped to its canonical brand/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Note (optional)'), 'looks right');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(calls.approve).toContainEqual([4, 'looks right']);
  });
});
