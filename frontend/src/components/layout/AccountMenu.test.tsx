import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu, SECTION_LABEL_INK } from './AccountMenu';

const auth = vi.hoisted(() => ({
  role: 'Employee' as 'Employee' | 'Manager' | 'Admin',
  superuser: false,
  language: 'en' as 'en' | 'es',
  setLanguage: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
  viewAs: null as null | Record<string, unknown>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 9,
      first_name: 'Ana',
      last_name: 'Lopez',
      full_name: 'Ana Lopez',
      role: auth.role,
      is_superuser: auth.superuser,
      language: auth.language,
    },
    setLanguage: auth.setLanguage,
    logout: auth.logout,
    viewAs: auth.viewAs,
    stopViewAs: vi.fn(),
    hasRole: (role: string) => auth.role === 'Admin' || (auth.role === 'Manager' && role !== 'Admin'),
  }),
}));

vi.mock('../viewAs/ViewAsDialog', () => ({ default: () => null }));

const theme = createTheme();

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

async function openMenu() {
  const user = userEvent.setup();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/inventory/search']}>
          <AccountMenu />
          <Where />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByTestId('account-menu-button'));
  return user;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('AccountMenu (me)', () => {
  beforeEach(() => {
    auth.role = 'Employee';
    auth.superuser = false;
    auth.language = 'en';
    auth.viewAs = null;
    localStorage.clear();
  });

  it('shows full name and role in the header', async () => {
    await openMenu();
    const header = screen.getByTestId('account-menu-header');
    expect(within(header).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(header).getByText('Employee')).toBeInTheDocument();
  });

  it('has no Home links (they are the Home tabs) and no Owner section for an Employee (Bill 2026-11-13)', async () => {
    await openMenu();
    for (const id of ['store', 'my-day', 'schedule', 'me', 'requests', 'messages']) {
      expect(screen.queryByTestId(`account-menu-${id}`)).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-menu-dash-fixes')).toBeInTheDocument();
    expect(screen.queryByTestId('account-menu-owner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-menu-texts')).not.toBeInTheDocument();
  });

  it('shows the OWNER section (Owner page) to the superuser only', async () => {
    auth.superuser = true;
    const user = await openMenu();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.queryByTestId('account-menu-reports')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('account-menu-owner'));
    expect(screen.getByTestId('where')).toHaveTextContent('/owner');
  });

  it('opens Dash Updates', async () => {
    const user = await openMenu();
    await user.click(screen.getByTestId('account-menu-dash-fixes'));
    expect(screen.getByTestId('where')).toHaveTextContent('/dash-updates');
  });

  it('keeps the Back-to row while viewing as someone, the language toggle, and Sign out', async () => {
    auth.viewAs = { real_user: { name: 'Bill Rollins' }, target: { name: 'Ana Lopez' } };
    const user = await openMenu();
    expect(screen.getByTestId('account-menu-view-as-back')).toHaveTextContent('Back to Bill');
    expect(screen.getByText('Language')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ES' }));
    expect(auth.setLanguage).toHaveBeenCalledWith('es');
    expect(screen.getByTestId('account-menu-sign-out')).toHaveTextContent('Sign out');
  });

  it('is in Spanish for a Spanish user', async () => {
    auth.language = 'es';
    await openMenu();
    expect(screen.getByText('Empleado')).toBeInTheDocument();
    expect(screen.getByTestId('account-menu-sign-out')).toHaveTextContent('Cerrar sesion');
  });

  it('draws section labels at 12px, semibold, dark ink with a divider above', async () => {
    auth.superuser = true;
    await openMenu();
    const label = screen.getByText('Owner');
    const style = getComputedStyle(label);
    expect(style.fontSize).toBe('12px');
    expect(Number(style.fontWeight)).toBeGreaterThanOrEqual(600);
    expect(style.letterSpacing).not.toBe('normal');
    expect(style.borderTopStyle).toBe('solid');
  });

  it('passes 4.5:1 for the section label ink on white', () => {
    const ratio = (luminance('#ffffff') + 0.05) / (luminance(SECTION_LABEL_INK) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
