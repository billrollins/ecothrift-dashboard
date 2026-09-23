import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BstockLoginHandoffPage from './BstockLoginHandoffPage';

const api = vi.hoisted(() => ({ postBstockLogin: vi.fn() }));
vi.mock('../../api/buying.api', () => api);

const auth = vi.hoisted(() => ({ superuser: true }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, is_superuser: auth.superuser } }),
}));

function pending(token = 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE5MDAwMDAwMDB9.sig') {
  window.sessionStorage.setItem('bstock.pendingToken', JSON.stringify({ value: token, at: Date.now() }));
}

function renderPage() {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/routines/bstock-login']}>
        <BstockLoginHandoffPage />
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('BstockLoginHandoffPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.superuser = true;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('sends nothing until the owner taps Send, then sends once', async () => {
    pending();
    api.postBstockLogin.mockResolvedValue({ connected: true, seconds_left: 45 * 60, expires_at: null, saved_at: null });
    renderPage();
    expect(screen.getByText('Send this B-Stock login?')).toBeTruthy();
    expect(api.postBstockLogin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/B-Stock connected · 45 min left/)).toBeTruthy();
    expect(api.postBstockLogin).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('bstock.pendingToken')).toBeNull();
    expect(window.localStorage.getItem('bstock.loginAt')).toBeTruthy();
  });

  it('keeps the login for a retry when the app cannot be reached', async () => {
    pending();
    api.postBstockLogin.mockRejectedValue({ response: { status: 503 } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(window.sessionStorage.getItem('bstock.pendingToken')).not.toBeNull();
  });

  it('drops a refused login', async () => {
    pending();
    api.postBstockLogin.mockRejectedValue({ response: { status: 400, data: { detail: 'That login has expired.' } } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('That login has expired.')).toBeTruthy();
    expect(window.sessionStorage.getItem('bstock.pendingToken')).toBeNull();
  });

  it('tells a non-owner why and discards the login', async () => {
    auth.superuser = false;
    pending();
    renderPage();
    expect(screen.getByText(/Only the owner/)).toBeTruthy();
    await waitFor(() => expect(window.sessionStorage.getItem('bstock.pendingToken')).toBeNull());
    expect(api.postBstockLogin).not.toHaveBeenCalled();
  });

  it('says so when there is nothing to send', () => {
    renderPage();
    expect(screen.getByText(/Nothing to send/)).toBeTruthy();
  });

  it('closes itself when the routine is open in another tab, and says so if it cannot', async () => {
    pending();
    window.localStorage.setItem('bstock.runnerOpenAt', String(Date.now()));
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
    expect(await screen.findByText(/could not close itself/)).toBeTruthy();
    close.mockRestore();
  });
});
