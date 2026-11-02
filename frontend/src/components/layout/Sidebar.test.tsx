import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

const auth = vi.hoisted(() => ({
  role: 'Admin' as 'Employee' | 'Manager' | 'Admin',
  superuser: true,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: auth.role, is_superuser: auth.superuser, language: 'en' } }),
}));
vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({}),
  useNavBadgeTones: () => ({}),
}));
vi.mock('../../hooks/useDeviceConfig', () => ({
  isRegisterDevice: () => false,
}));

function renderSidebar(path = '/buying/auctions') {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Sidebar (the workspace you are in)', () => {
  beforeEach(() => {
    auth.role = 'Admin';
    auth.superuser = true;
    localStorage.clear();
  });

  it('has no Essentials group: Dashboard, Owner and Reports are not sidebar links', () => {
    renderSidebar();
    for (const name of ['Dashboard', 'Owner', 'Reports']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('puts Supplies in the Admin workspace, which opens when its page is entered by URL', () => {
    renderSidebar('/supplies');
    expect(screen.getAllByText('Supplies').length).toBeGreaterThan(0);
  });

  it('does not offer an Employee the Admin workspace, so no Supplies row', () => {
    auth.role = 'Employee';
    auth.superuser = false;
    renderSidebar('/buying/auctions');
    expect(screen.queryByText('Supplies')).not.toBeInTheDocument();
  });
});
