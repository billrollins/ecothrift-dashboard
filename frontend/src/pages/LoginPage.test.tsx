import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { clearIdleSignOut, peekIdleSignOut, rememberIdleSignOut } from '../api/client';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));

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
