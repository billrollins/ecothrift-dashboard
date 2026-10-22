import { ThemeProvider, createTheme } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User, ViewAs } from '../../types/accounts.types';
import ViewAsBanner from './ViewAsBanner';
import { canViewAs } from './viewAs';

const auth = vi.hoisted(() => ({ viewAs: null as unknown, stopViewAs: vi.fn() }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

const VIEWING: ViewAs = {
  session: 7,
  target: { id: 2, name: 'Maria K', full_name: 'Maria Kay', job: 'Processing Associate' },
  real_user: { id: 1, name: 'Bill R', full_name: 'Bill Rollins' },
  started_at: '2026-10-22T14:00:00Z',
  expires_at: '2026-10-22T16:00:00Z',
};

function renderBanner() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ViewAsBanner />
    </ThemeProvider>,
  );
}

describe('ViewAsBanner', () => {
  beforeEach(() => {
    auth.viewAs = null;
    auth.stopViewAs = vi.fn();
    document.documentElement.style.removeProperty('--view-as-band');
  });

  it('shows nothing when not viewing as anyone', () => {
    renderBanner();
    expect(screen.queryByTestId('view-as-banner')).toBeNull();
  });

  it('says who is viewed, who is signed in, read only, and has Back', () => {
    auth.viewAs = VIEWING;
    renderBanner();
    const band = screen.getByTestId('view-as-banner');
    expect(band.textContent).toContain('Viewing as Maria K');
    expect(band.textContent).toContain('(Processing Associate)');
    expect(band.textContent).toContain('signed in as Bill');
    expect(band.textContent).toContain('read only');
    fireEvent.click(screen.getByTestId('view-as-back'));
    expect(screen.getByTestId('view-as-back').textContent).toBe('Back to Bill');
    expect(auth.stopViewAs).toHaveBeenCalledTimes(1);
  });

  it('marks the page so the app shells start below the band', () => {
    auth.viewAs = VIEWING;
    const { unmount } = renderBanner();
    expect(document.documentElement.style.getPropertyValue('--view-as-band')).toMatch(/px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue('--view-as-band')).toBe('');
  });
});

describe('canViewAs', () => {
  const owner = { id: 1, is_superuser: true, view_as: null } as unknown as User;
  const maria = { id: 2, is_active: true, is_superuser: false, is_staff: true, role: 'Employee' } as User;

  it('lets the owner view as a switched-on employee', () => {
    expect(canViewAs(owner, maria)).toBe(true);
  });

  it('never for a non-owner, another owner, self, a switched-off login, a customer, or while viewing', () => {
    expect(canViewAs({ ...owner, is_superuser: false } as User, maria)).toBe(false);
    expect(canViewAs(owner, { ...maria, is_superuser: true })).toBe(false);
    expect(canViewAs(owner, { ...maria, id: 1 })).toBe(false);
    expect(canViewAs(owner, { ...maria, is_active: false })).toBe(false);
    expect(canViewAs(owner, { ...maria, is_staff: false, role: 'Customer' })).toBe(false);
    expect(canViewAs({ ...owner, view_as: VIEWING } as User, maria)).toBe(false);
  });
});
