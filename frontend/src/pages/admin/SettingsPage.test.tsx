import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

const SETTINGS = [
  { key: 'thrift_plus_enabled', value: false, updated_by_name: 'Bill Rollins', updated_at: '2026-10-07T12:00:00Z' },
  { key: 'thrift_plus_preview_code', value: 'abc12345' },
  { key: 'thrift_plus_test_registers', value: ['R3'] },
  { key: 'thrift_plus_nonreturnable_words', value: ['as-is', 'for parts'] },
  { key: 'tax_rate', value: 0.07 },
  { key: 'buying_shrink_new', value: 0 },
  { key: 'ai_cleanup_job:384', value: { model: 'muse', status: 'done', rows_saved: 1796, started_by: 'Bill', finished_at: '2026-10-01T22:56:39Z' } },
  { key: 'ai_price_check', value: { status: 'done', checker: 'claude-opus-5-5', results: [{ id: 1 }] } },
  { key: 'mystery_flag', value: { a: 1 } },
];

vi.mock('../../api/core.api', async (orig) => ({
  ...(await orig<typeof import('../../api/core.api')>()),
  getSettings: vi.fn(async () => ({ data: SETTINGS })),
  getAppVersion: vi.fn(async () => ({ data: { version: '2.147.0' } })),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'Admin', is_superuser: true }, hasRole: () => true }),
}));
// Heavy panels with their own requests are not what this test is about.
vi.mock('./settings/PrintingPanel', () => ({ PrintingPanel: () => <div>printing panel</div> }));
vi.mock('./settings/AiPanel', () => ({ AiPanel: () => <div>ai panel</div> }));
vi.mock('./settings/PermissionsPanel', () => ({ PermissionsPanel: () => <div>permissions panel</div> }));
vi.mock('./settings/HolidayHoursCard', () => ({ HolidayHoursCard: () => <div>holiday hours</div> }));
vi.mock('./settings/StaffPurchasesEditor', () => ({ StaffPurchasesEditor: () => <div>staff purchases editor</div> }));

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[url]}>
          <SettingsPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SettingsPage (owner, 2026-10-07)', () => {
  it('shows the tabs, opens the first section, and tags Thrift+ launch as pre-launch', async () => {
    renderAt('/admin/settings?tab=thrift-plus');
    expect(await screen.findByText('Thrift+ is on')).toBeInTheDocument();
    for (const label of ['Store', 'Thrift+', 'Buying', 'Inventory', 'Retail QA', 'Printing', 'AI', 'People', 'System']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('Pre-launch')).toBeInTheDocument();
    expect(screen.getByText('R3')).toBeInTheDocument();                         // a list as chips
    expect(screen.getByText(/Changed by Bill Rollins/)).toBeInTheDocument();
    const preview = screen.getByRole('link', { name: 'https://ecothrift.us/scan?preview=abc12345' });
    expect(preview).toHaveAttribute('href', 'https://ecothrift.us/scan?preview=abc12345'); // the staff link, ready to tap
  });

  it('shows job state as tables on System, never raw JSON, and unknown keys under Unsorted', async () => {
    renderAt('/admin/settings?tab=system&section=jobs');
    expect(await screen.findByText('AI cleanup jobs')).toBeInTheDocument();
    expect(screen.getByText('384')).toBeInTheDocument();
    expect(screen.getByText('1796')).toBeInTheDocument();
    expect(screen.queryByText(/"rows_saved"/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Unsorted'));
    expect(await screen.findByText('mystery_flag')).toBeInTheDocument();
  });

  it('finds a setting on another tab from the search box', async () => {
    renderAt('/admin/settings');
    const box = await screen.findByPlaceholderText(/Find a setting/);
    await userEvent.type(box, 'shrink');
    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Default PO est. shrink')).toBeInTheDocument();
    await userEvent.click(within(list).getByText('Default PO est. shrink'));
    expect(await screen.findByRole('tab', { name: 'Buying', selected: true })).toBeInTheDocument();
  });
});
