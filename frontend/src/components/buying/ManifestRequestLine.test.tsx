import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManifestRequestState } from '../../types/buying.types';
import ManifestRequestLine from './ManifestRequestLine';

const api = vi.hoisted(() => ({ fetchManifestRequest: vi.fn(), postManifestRequest: vi.fn() }));
vi.mock('../../api/buying.api', () => api);

const now = new Date().toISOString();

function req(fields: Partial<ManifestRequestState>): ManifestRequestState {
  return { id: 1, status: 'requested', requested_at: now, finished_at: null, note: '', login_live: true, ...fields };
}

function renderLine(onPulled = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ManifestRequestLine auctionId={7} bstockUrl="https://bstock.com/buy/listings/details/abc" onPulled={onPulled} />
    </QueryClientProvider>,
  );
  return onPulled;
}

describe('ManifestRequestLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('offers Get manifest, then says it waits for the login with Connect B-Stock', async () => {
    api.fetchManifestRequest.mockResolvedValue(null);
    api.postManifestRequest.mockResolvedValue(req({ login_live: false, note: 'Waiting for your B-Stock login.' }));
    renderLine();
    fireEvent.click(await screen.findByRole('button', { name: 'Get manifest' }));
    expect(await screen.findByText(/Your B-Stock login is off/)).toBeTruthy();
    const connect = screen.getByRole('link', { name: /Connect B-Stock/ });
    expect(connect.getAttribute('href')).toBe('https://bstock.com/buy/listings/details/abc');
    expect(screen.queryByRole('button', { name: 'Get manifest' })).toBeNull();
    // The hand-off tab can close itself: this page says it is open.
    expect(window.localStorage.getItem('bstock.runnerOpenAt')).toBeTruthy();
  });

  it('says why a waiting request is paused', async () => {
    api.fetchManifestRequest.mockResolvedValue(req({ note: 'Paused: the hourly B-Stock limit is reached.' }));
    renderLine();
    expect(await screen.findByText(/hourly B-Stock limit/)).toBeTruthy();
  });

  it('shows the reason and Retry when it failed', async () => {
    api.fetchManifestRequest.mockResolvedValue(req({ status: 'failed', note: 'B-Stock has no manifest for this lot.' }));
    api.postManifestRequest.mockResolvedValue(req({ status: 'pulling' }));
    renderLine();
    expect(await screen.findByText(/Failed: B-Stock has no manifest/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Pulling from B-Stock/)).toBeTruthy();
  });

  it('shows a lot that can never be pulled with the reason', async () => {
    api.fetchManifestRequest.mockResolvedValue(null);
    api.postManifestRequest.mockRejectedValue({ response: { status: 400, data: { detail: 'Contract listings have no manifest to pull.' } } });
    renderLine();
    fireEvent.click(await screen.findByRole('button', { name: 'Get manifest' }));
    expect(await screen.findByText('Contract listings have no manifest to pull.')).toBeTruthy();
  });

  it('loads the rows once when pulled', async () => {
    api.fetchManifestRequest.mockResolvedValue(req({ status: 'pulled' }));
    const onPulled = renderLine();
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(1));
  });
});
