import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupLine, nextUpId, waitingOn } from '../../components/dashFixes/dashFixesModel';
import { ReportFixDialog } from '../../components/dashFixes/ReportFixDialog';
import { rememberPage, sourcePage } from '../../components/dashFixes/rememberPage';
import type { DashFixDTO } from '../../types/dashFixes.types';
import DashFixesPage from './DashFixesPage';

const state = vi.hoisted(() => ({ rows: [] as DashFixDTO[], superuser: false, report: vi.fn() }));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, language: 'en', is_superuser: state.superuser } }),
}));
vi.mock('../../hooks/useDashFixes', () => ({
  dashFixesKey: ['dashFixes'],
  dashFixCountKey: ['dashFixes', 'count'],
  useDashFixes: () => ({ data: state.rows, isLoading: false }),
  useMarkDashFixesSeen: () => ({ mutate: vi.fn() }),
  useReorderDashFixes: () => ({ mutate: vi.fn(), isError: false }),
  useReportDashFix: () => ({ mutate: state.report, isPending: false }),
  useAddDashFixNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDashFixOwnerAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../api/core.api', () => ({ getAppVersion: async () => ({ data: { version: '2.240.0' } }) }));

function fix(over: Partial<DashFixDTO>): DashFixDTO {
  return {
    id: 1, title: 'Made up', details: '', page_path: '/x', kind: 'problem', status: 'accepted', rank: 1,
    private: false, decline_reason: '', done_version: '', done_at: null, accepted_at: null,
    status_changed_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z', submitted_by: 2,
    submitted_by_name: 'Ann Bench', photos: [], is_mine: false, unseen: false, notes: [], size: '',
    depends_on: [], project: '', step: null, waiting_on: '', session: '', updated_at: '2026-11-01T10:00:00Z', ...over,
  };
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter initialEntries={['/dash-updates']}>
          <DashFixesPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.superuser = false;
  state.report.mockReset();
  state.rows = [
    fix({ id: 1, title: 'First task', rank: 1, project: 'Nav', step: 2 }),
    fix({ id: 2, title: 'Second task', rank: 2, project: 'Nav', step: 1, depends_on: [1] }),
    fix({ id: 3, title: 'Working one', status: 'working', rank: 3 }),
    fix({ id: 4, title: 'Waiting one', status: 'new', rank: 0, is_mine: true }),
    fix({ id: 5, title: 'Finished one', status: 'done', rank: 0, done_version: 'v2.240.0', done_at: '2026-11-05T12:00:00Z' }),
    fix({ id: 6, title: 'Nope one', status: 'declined', rank: 0, decline_reason: 'Too big' }),
    fix({ id: 7, title: 'Held one', status: 'hold', rank: 0 }),
  ];
});

describe('model helpers', () => {
  it('groups by project in step order, finds next up, and shows open dependencies', () => {
    const line = state.rows.filter((r) => r.rank > 0);
    const groups = groupLine(line);
    expect(groups[0].project).toBe('Nav');
    expect(groups[0].items.map((r) => r.id)).toEqual([2, 1]);
    const byId = new Map(state.rows.map((r) => [r.id, r]));
    expect(waitingOn(byId.get(2)!, byId).map((r) => r.id)).toEqual([1]);
    expect(nextUpId(line, byId)).toBe(1);
  });
});

describe('Dash Updates page', () => {
  it('shows the sections and status chips', () => {
    renderPage();
    expect(screen.getByTestId('fix-section-line')).toHaveTextContent('In line (3)');
    expect(screen.getByTestId('fix-section-waiting')).toHaveTextContent('Waiting for Bill (1)');
    expect(screen.getByTestId('fix-section-hold')).toHaveTextContent('Parked (1)');
    expect(screen.getByTestId('fix-status-3')).toHaveTextContent('Working on it');
    expect(screen.getByTestId('fix-status-5')).toHaveTextContent('Done in v2.240.0');
    expect(screen.getByTestId('fix-status-6')).toHaveTextContent('Not doing: Too big');
    expect(screen.getByTestId('fix-project-2')).toHaveTextContent('Nav · step 1 of 2');
    expect(screen.getByTestId('fix-after-2-1')).toHaveTextContent('after #1');
    expect(screen.getByTestId('fix-next-1')).toBeInTheDocument();
  });

  it('collapses Done after the last 3', async () => {
    state.rows = Array.from({ length: 12 }, (_, i) =>
      fix({ id: 100 + i, status: 'done', rank: 0, done_at: `2026-11-${10 + i}T12:00:00Z` }));
    renderPage();
    expect(screen.getByTestId('fix-done-list').children).toHaveLength(3);
    await userEvent.click(screen.getByTestId('fix-done-toggle'));
    expect(screen.getByTestId('fix-done-list').children).toHaveLength(12);
  });

  it('hides owner controls from staff and shows them to the owner', async () => {
    renderPage();
    expect(screen.queryByTestId('fix-json-tools')).toBeNull();
    expect(screen.queryByLabelText(/Move up/)).toBeNull();
    await userEvent.click(within(screen.getByTestId('fix-row-1')).getByRole('button', { name: 'First task' }));
    expect(screen.getByTestId('fix-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('fix-owner-controls')).toBeNull();
  });

  it('gives the owner the JSON tools, reorder buttons and controls', async () => {
    state.superuser = true;
    renderPage();
    expect(screen.getByTestId('fix-json-tools')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Move up/).length).toBeGreaterThan(0);
    await userEvent.click(within(screen.getByTestId('fix-row-1')).getByRole('button', { name: 'First task' }));
    expect(screen.getByTestId('fix-owner-controls')).toBeInTheDocument();
    // Delete asks first, on the page.
    await userEvent.click(screen.getByTestId('fix-delete'));
    expect(screen.getByTestId('fix-delete-sure')).toHaveTextContent('for good');
  });
});

describe('Dash Updates desktop table', () => {
  function asDesktop() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width'), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  }

  it('shows one table row per update with rich fields; a click opens the drawer', async () => {
    asDesktop();
    state.rows[2] = fix({ id: 3, title: 'Working one', status: 'working', rank: 3, session: 'lane/dash-updates', size: 'M' });
    state.rows[3] = fix({ id: 4, title: 'Almost one', status: 'almost', rank: 4, waiting_on: 'ship' });
    renderPage();
    expect(screen.getByTestId('fix-line').querySelector('table')).not.toBeNull();
    const row = screen.getByTestId('fix-row-3');
    expect(row.tagName).toBe('TR');
    expect(row).toHaveTextContent('#3');
    expect(row).toHaveTextContent('Ann Bench');
    expect(screen.getByTestId('fix-session-3')).toHaveTextContent('lane/dash-updates');
    expect(screen.getByTestId('fix-status-4')).toHaveTextContent('Almost done · waiting on ship');
    expect(screen.getByTestId('fix-after-2-1')).toHaveTextContent('after #1');
    expect(screen.getByTestId('fix-group-Nav')).toBeInTheDocument();
    expect(screen.getByTestId('fix-done-list').querySelector('table')).not.toBeNull();
    await userEvent.click(row);
    expect(screen.getByTestId('fix-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('fix-drawer-session')).toHaveTextContent('lane/dash-updates');
    vi.unstubAllGlobals();
  });
});

describe('Ask for an update', () => {
  it('sends the page the person was on, with the explanation', async () => {
    rememberPage('/inventory/processing');
    expect(sourcePage('/dash-updates')).toBe('/inventory/processing');
    expect(sourcePage('/dash-fixes')).toBe('/inventory/processing');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReportFixDialog open onClose={vi.fn()} pagePath={sourcePage('/dash-updates')} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('report-fix-page')).toHaveTextContent('/inventory/processing');
    await userEvent.click(screen.getByTestId('report-fix-send'));
    expect(state.report).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId('report-fix-details'), 'Scanner lags');
    await userEvent.click(screen.getByTestId('report-fix-send'));
    expect(state.report.mock.calls[0][0]).toMatchObject({ details: 'Scanner lags', page_path: '/inventory/processing' });
  });
});
