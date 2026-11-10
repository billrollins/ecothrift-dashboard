import { ThemeProvider, createTheme } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

const auth = vi.hoisted(() => ({
  role: 'Admin' as 'Employee' | 'Manager' | 'Admin',
  superuser: true,
  /** Their department's "Starts in" workspace; null = no employee profile. */
  departmentStart: null as string | null,
  registerComputer: false,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: auth.role,
      is_superuser: auth.superuser,
      language: 'en',
      employee: auth.departmentStart == null ? null : { department_start_workspace: auth.departmentStart },
    },
  }),
}));
vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({}),
  useNavBadgeTones: () => ({}),
}));
vi.mock('../../hooks/useDeviceConfig', () => ({
  isRegisterDevice: () => auth.registerComputer,
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
    auth.departmentStart = null;
    auth.registerComputer = false;
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

/** #86 (Bill 2026-11-10): "by default have users workspace default to their department". */
describe('Sidebar: where the menu starts with nothing remembered', () => {
  const REMEMBERED = 'ecothrift.navC.workspace.v1.1';
  // A page in no workspace, so the address does not pick the workspace.
  const HOME = '/';
  const openOn = (name: string) => screen.getByRole('button', { name: `Workspace, ${name}` });

  beforeEach(() => {
    auth.role = 'Employee';
    auth.superuser = false;
    auth.departmentStart = null;
    auth.registerComputer = false;
    localStorage.clear();
  });

  it("opens on the department's workspace, and remembers it", () => {
    auth.departmentStart = 'processing';
    renderSidebar(HOME);
    expect(openOn('Processing')).toBeInTheDocument();
    expect(screen.getByText('Receiving')).toBeInTheDocument();
    expect(localStorage.getItem(REMEMBERED)).toBe('processing');
  });

  it('opens a register computer on Retail, whatever the department', () => {
    auth.departmentStart = 'processing';
    auth.registerComputer = true;
    renderSidebar(HOME);
    expect(openOn('Retail')).toBeInTheDocument();
  });

  it('opens on Buying when the department sets none, or there is no department', () => {
    auth.departmentStart = '';
    const first = renderSidebar(HOME);
    expect(openOn('Buying')).toBeInTheDocument();
    first.unmount();
    localStorage.clear();
    auth.departmentStart = null;
    renderSidebar(HOME);
    expect(openOn('Buying')).toBeInTheDocument();
  });

  it('lets a remembered workspace win over the department and the register computer', () => {
    localStorage.setItem(REMEMBERED, 'restoration');
    auth.departmentStart = 'processing';
    auth.registerComputer = true;
    renderSidebar(HOME);
    expect(openOn('Restoration')).toBeInTheDocument();
    expect(localStorage.getItem(REMEMBERED)).toBe('restoration');
  });

  it('skips a department start the person cannot see', () => {
    auth.departmentStart = 'admin';
    renderSidebar(HOME);
    expect(openOn('Buying')).toBeInTheDocument();
  });

  it('hides nothing: the same workspaces are offered with or without a department start', () => {
    const offered = () => {
      const view = renderSidebar(HOME);
      fireEvent.click(screen.getByRole('button', { name: /^Workspace, / }));
      const names = screen.getAllByRole('menuitemradio').map((row) => row.textContent);
      view.unmount();
      localStorage.clear();
      return names;
    };
    const without = offered();
    auth.departmentStart = 'processing';
    const withStart = offered();
    expect(without.length).toBeGreaterThan(3);
    expect(withStart).toEqual(without);
  });
});
