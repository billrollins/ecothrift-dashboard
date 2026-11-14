import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage, { devSignInShown } from './LoginPage';
import { clearIdleSignOut, peekIdleSignOut, rememberIdleSignOut } from '../api/client';

const devLogin = vi.fn(() => Promise.resolve());
const navigate = vi.fn();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login: vi.fn(), devLogin }) }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage idle notice (D16)', () => {
  afterEach(() => clearIdleSignOut());

  it('says so once when the person was signed out for being idle', () => {
    rememberIdleSignOut({ code: 'IDLE', detail: 'Signed out after 4 hours idle.' });
    renderLogin();
    expect(screen.getByTestId('login-idle-notice')).toHaveTextContent('Signed out after 4 hours idle.');
    expect(peekIdleSignOut()).toBeNull();
  });

  it('shows nothing on an ordinary visit', () => {
    renderLogin();
    expect(screen.queryByTestId('login-idle-notice')).toBeNull();
  });
});

describe('LoginPage As Bill button (#144, local dev only)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    devLogin.mockClear();
    navigate.mockClear();
  });

  it('is absent when not a dev server', () => {
    vi.stubEnv('DEV', false);
    expect(devSignInShown()).toBe(false);
    renderLogin();
    expect(screen.queryByTestId('login-dev-as-bill')).toBeNull();
  });

  it('is absent on a dev server opened by another name than localhost or 127.0.0.1', () => {
    vi.stubEnv('DEV', true);
    for (const hostname of ['bills-pc.local', 'dash.ecothrift.us', '192.168.1.20']) {
      vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, hostname });
      expect(devSignInShown()).toBe(false);
    }
    vi.restoreAllMocks();
  });

  it('signs in as Bill with one click on localhost and lands where a sign-in lands', async () => {
    vi.stubEnv('DEV', true);
    renderLogin();
    fireEvent.click(screen.getByTestId('login-dev-as-bill'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(devLogin).toHaveBeenCalledTimes(1);
  });
});
