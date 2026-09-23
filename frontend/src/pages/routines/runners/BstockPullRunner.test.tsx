import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BstockPullResponses } from '../../../api/routines.api';
import type { ManifestPullJob, ManifestPullState } from '../../../types/buying.types';
import { BstockPullRunner } from './BstockPullRunner';
import { KindRunner } from './KindRunner';

const api = vi.hoisted(() => ({
  fetchManifestPull: vi.fn(),
  postManifestPull: vi.fn(),
  postBstockLogin: vi.fn(),
  stopManifestPull: vi.fn(),
  deleteBstockLogin: vi.fn(),
}));
vi.mock('../../../api/buying.api', () => api);

function job(overrides: Partial<ManifestPullJob> = {}): ManifestPullJob {
  return {
    id: 9,
    status: 'queued',
    total: 0,
    done: 0,
    ok: 0,
    error: '',
    created_at: new Date().toISOString(),
    finished_at: null,
    stalled: false,
    results: [],
    ...overrides,
  };
}

function state(
  connected: boolean,
  current: ManifestPullJob | null = null,
  shortlist = 12,
  secondsLeft = 50 * 60,
): ManifestPullState {
  return {
    job: current,
    login: { connected, expires_at: null, seconds_left: connected ? secondsLeft : 0, saved_at: null },
    shortlist_count: shortlist,
    waiting_retry_count: 0,
  };
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/routines/run/7']}>{node}</MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function renderRunner(
  responses: BstockPullResponses = { job_id: null, job_status: null },
  props: { preview?: boolean; readOnly?: boolean } = {},
) {
  const onChange = vi.fn();
  render(wrap(
    <BstockPullRunner title="Pull B-Stock manifests" responses={responses} onChange={onChange} {...props} />,
  ));
  return onChange;
}

describe('BstockPullRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('will not pull until the B-Stock login is sent', async () => {
    api.fetchManifestPull.mockResolvedValue(state(false));
    renderRunner();
    expect(await screen.findByText('12 auctions ending soon need one')).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pull manifests' })).toHaveProperty('disabled', true);
  });

  it('starts a pull and records the job on the run', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true));
    api.postManifestPull.mockResolvedValue(state(true, job()));
    const onChange = renderRunner();
    expect(await screen.findByText('Connected · 50 min left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pull manifests' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 9, job_status: 'queued' }),
    ));
  });

  it('keeps the earlier pull on the run when pulling the rest', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true, job({ id: 4, status: 'done', total: 1, done: 1, ok: 1 })));
    api.postManifestPull.mockResolvedValue(state(true, job({ id: 9 })));
    const onChange = renderRunner({ job_id: 4, job_status: 'done' });
    fireEvent.click(await screen.findByRole('button', { name: 'Pull the rest' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 9, earlier_job_ids: [4] }),
    ));
  });

  it('marks a quiet day so the routine can be finished', async () => {
    api.fetchManifestPull.mockResolvedValue(state(false, null, 0));
    const onChange = renderRunner();
    expect(await screen.findByText('Nothing to pull right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pull manifests' })).toHaveProperty('disabled', true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nothing_to_pull: true })));
  });

  it('attaches a pull started today in one change, even on a quiet day', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true, job({ status: 'done', total: 2, done: 2, ok: 2 }), 0));
    const onChange = renderRunner();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 9, job_status: 'done', nothing_to_pull: true }),
    ));
  });

  it('keeps the run in step with the job so Submit unlocks', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true, job({ status: 'done', total: 2, done: 2, ok: 2 })));
    const onChange = renderRunner({ job_id: 9, job_status: 'running' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ job_id: 9, job_status: 'done' })));
    expect(screen.getAllByText('2 of 2 pulled').length).toBeGreaterThan(0);
  });

  it('stops a running pull, and a stalled one can be resumed or stopped', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true, job({ status: 'running', total: 4, done: 1, stalled: true })));
    api.stopManifestPull.mockResolvedValue(state(true, job({ status: 'stopped' })));
    renderRunner({ job_id: 9, job_status: 'running' });
    expect(await screen.findByRole('button', { name: 'Resume the pull' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(api.stopManifestPull).toHaveBeenCalled());
  });

  it('will not start a pull on a login about to run out', async () => {
    api.fetchManifestPull.mockResolvedValue(state(true, null, 12, 90));
    renderRunner();
    expect(await screen.findByText(/Under 3 minutes of login left/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pull manifests' })).toHaveProperty('disabled', true);
  });

  it('asks before sending a login that arrived through a sign-in bounce', async () => {
    window.sessionStorage.setItem('bstock.pendingToken', JSON.stringify({ value: 'eyJ.a.b', at: Date.now() }));
    api.fetchManifestPull.mockResolvedValue(state(true));
    api.postBstockLogin.mockResolvedValue(state(true).login);
    renderRunner();
    // Offered even while an older login is connected: it may be about to run out.
    expect(await screen.findByText('A newer B-Stock login is waiting to be sent.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(api.postBstockLogin).toHaveBeenCalledTimes(1));
    expect(api.postBstockLogin.mock.calls[0][0]).toBe('eyJ.a.b');
  });

  it('shows a failed status request as an error, not as disconnected', async () => {
    api.fetchManifestPull.mockRejectedValue(new Error('500'));
    renderRunner();
    expect(await screen.findByText('Could not load the pull status.')).toBeTruthy();
    expect(screen.queryByText('Not connected')).toBeNull();
  });

  it('shows a finished run read-only, earlier pulls included, without polling', async () => {
    api.fetchManifestPull.mockImplementation(async (id: number) => (
      id === 4
        ? state(true, job({ id: 4, status: 'done', total: 1, done: 1, ok: 1, results: [
          { auction_id: 1, title: 'First lot', ok: true, rows: 5, error: '' },
        ] }))
        : state(true, job({ status: 'done', total: 1, done: 1, ok: 1, results: [
          { auction_id: 2, title: 'Second lot', ok: true, rows: 7, error: '' },
        ] }))
    ));
    renderRunner({ job_id: 9, job_status: 'done', earlier_job_ids: [4] }, { readOnly: true });
    expect(await screen.findByText('Second lot')).toBeTruthy();
    expect(await screen.findByText('First lot')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pull/ })).toBeNull();
  });

  it('makes no requests as a catalog preview', () => {
    renderRunner(undefined, { preview: true });
    expect(api.fetchManifestPull).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pull manifests' })).toHaveProperty('disabled', true);
  });

  it('is what KindRunner shows for the bstock_pull kind', async () => {
    api.fetchManifestPull.mockResolvedValue(state(false));
    render(wrap(
      <KindRunner
        kind="bstock_pull"
        title="Pull B-Stock manifests"
        subject=""
        responses={{ job_id: null, job_status: null }}
        taxonomy={null}
        verify={null}
        minItems={0}
        preview
      />,
    ));
    expect(screen.getByText('1. Log in to B-Stock')).toBeTruthy();
    expect(api.fetchManifestPull).not.toHaveBeenCalled();
  });
});
