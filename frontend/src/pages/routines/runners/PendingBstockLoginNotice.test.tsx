import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingBstockLoginNotice } from './PendingBstockLoginNotice';

const auth = vi.hoisted(() => ({ superuser: true }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, is_superuser: auth.superuser } }),
}));

function pending() {
  window.sessionStorage.setItem('bstock.pendingToken', JSON.stringify({ value: 'eyJ.a.b', at: Date.now() }));
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PendingBstockLoginNotice />
      <Routes>
        <Route path="/dashboard" element={<p>Dashboard</p>} />
        <Route path="/routines/bstock-login" element={<p>Hand-off</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PendingBstockLoginNotice', () => {
  beforeEach(() => {
    auth.superuser = true;
    window.sessionStorage.clear();
  });

  it('points the owner back to a login a sign-in bounce left waiting', () => {
    pending();
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Hand-off')).toBeTruthy();
  });

  it('stays quiet with nothing waiting', () => {
    renderAt('/dashboard');
    expect(screen.queryByText(/waiting to be sent/)).toBeNull();
  });

  it('drops the login from anyone else’s session', () => {
    auth.superuser = false;
    pending();
    renderAt('/dashboard');
    expect(screen.queryByText(/waiting to be sent/)).toBeNull();
    expect(window.sessionStorage.getItem('bstock.pendingToken')).toBeNull();
  });
});
