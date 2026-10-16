/** Users → Members (owner 2026-10-16): two-line cells, the stages, the drawer's actions on top and Delete at the bottom. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import MembersPanel from './MembersPanel';
import { shortBucks } from '../../../api/memberDirectory.api';

const state = vi.hoisted(() => ({ superuser: true, rows: [] as Array<Record<string, unknown>>, sent: [] as string[] }));

vi.mock('../../../api/memberDirectory.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/memberDirectory.api')>()),
  fetchMembers: async () => state.rows,
  sendMemberLink: async (key: string) => { state.sent.push(key); return { detail: 'ok' }; },
}));

const added = vi.hoisted(() => ({ calls: [] as Array<[number, Record<string, unknown>]> }));
vi.mock('../../../api/thriftplus.api', () => ({
  addSecondAdult: async (id: number, body: Record<string, unknown>) => { added.calls.push([id, body]); return {}; },
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, is_superuser: state.superuser } }) }));
vi.mock('../../../hooks/useIsMobileLayout', () => ({ useIsMobileLayout: () => false }));
vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, columns, onRowClick }: {
    rows?: Array<Record<string, unknown>>;
    columns?: Array<{ field: string; headerName?: string; renderCell?: (p: { row: Record<string, unknown> }) => unknown }>;
    onRowClick?: (p: { row: Record<string, unknown> }) => void;
  }) => (
    <div>
      <div data-testid="headers">{(columns || []).map((c) => c.headerName).join('|')}</div>
      {(rows || []).map((row) => (
        <div key={String(row.key)} data-testid="row" onClick={() => onRowClick?.({ row })}>
          {(columns || []).map((col) => <div key={col.field}>{col.renderCell?.({ row }) as never}</div>)}
        </div>
      ))}
    </div>
  ),
}));

const BASE = {
  kind: 'member', user_id: null, second: '', credit: '0.00', bucks_lifetime: '0.00', sales: 0, spent: '0.00',
  last_visit: null, holds_active: 0, holds_total: 0, needs_reply: false, notes: '', staff: '', legacy: false, returns: 0,
};
const ANA = { ...BASE, key: 'a7', account_id: 7, number: '7166 7172 0440', name: 'Ana Diaz', email: 'ana@example.com', phone: '4025550101',
  stage: 'member', since: '2026-10-01T12:00:00Z', bucks: '1234.00', returns: 2, holds_active: 1, holds_total: 3, notes: 'Prefers text' };
const PAT = { ...BASE, key: 'a9', account_id: 9, number: '1234 5678 9012', name: 'Pat New', email: 'pat@example.com', phone: '',
  stage: 'needs_finalize', since: '2026-10-16T12:00:00Z', bucks: '0.00' };

function wrap() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><SnackbarProvider><MembersPanel /></SnackbarProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.rows = [PAT, ANA];
  state.superuser = true;
  state.sent = [];
  added.calls = [];
});

describe('MembersPanel', () => {
  it('shows two-line cells in the owner\'s order, with Needs Finalize and short ThriftBucks', async () => {
    wrap();
    const rows = await screen.findAllByTestId('row');
    expect(screen.getByTestId('headers').textContent).toBe(
      'Name / Member #|Since / ThriftBucks · Returns|Phone / Email|Holds / Last visit|State / Notes',
    );
    expect(rows[0]).toHaveTextContent('Pat New');
    expect(rows[0]).toHaveTextContent('Needs Finalize');
    expect(rows[1]).toHaveTextContent('1.2K ThriftBucks · 2 returns');
    expect(rows[1]).toHaveTextContent('1 active · 3');
    expect(rows[1]).toHaveTextContent('Prefers text');
  });

  it('filters to Needs Finalize', async () => {
    const user = userEvent.setup();
    wrap();
    await screen.findAllByTestId('row');
    await user.click(screen.getByRole('button', { name: /Needs Finalize 1/ }));
    expect(screen.getAllByTestId('row')).toHaveLength(1);
  });

  it('opens the drawer: actions on top, Deactivate and Delete at the bottom (Delete for the superuser only)', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click((await screen.findAllByTestId('row'))[1]);
    const actions = await screen.findByTestId('member-actions');
    await user.click(within(actions).getByRole('button', { name: 'Send sign-in link' }));
    expect(state.sent).toEqual(['a7']);
    const danger = screen.getByTestId('member-danger');
    expect(within(danger).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(within(danger).getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('hides Delete from a manager', async () => {
    state.superuser = false;
    const user = userEvent.setup();
    wrap();
    await user.click((await screen.findAllByTestId('row'))[1]);
    expect(within(await screen.findByTestId('member-danger')).queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  it('shortens ThriftBucks', () => {
    expect([shortBucks('135'), shortBucks('1234'), shortBucks('1250000'), shortBucks('4.5')]).toEqual(['135', '1.2K', '1.3M', '4.5']);
  });

it('See QR sits at the top of the drawer, and Add a person needs a name, the ID, a photo and the approval', async () => {
  const user = userEvent.setup();
  state.rows = [{ ...ANA, qr: 'TP402155831907', code_display: '4021 5583 1907', can_add_person: true }];
  wrap();
  await user.click(await screen.findByText('Ana Diaz'));
  await user.click(screen.getByTestId('member-see-qr'));
  expect(screen.getByTestId('member-qr')).toHaveTextContent('4021 5583 1907');
  expect(screen.getByRole('img', { name: "Ana Diaz's member QR" })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Add a person' }));
  const go = screen.getByRole('button', { name: 'Add them' });
  await user.type(screen.getByLabelText('Their name'), 'Sam Diaz');
  await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
  await user.click(screen.getByRole('checkbox', { name: 'Both are here, and Ana approves' }));
  expect(go).toBeDisabled(); // still needs the photo
  const photo = new File(['jpg'], 'sam.jpg', { type: 'image/jpeg' });
  await user.upload(document.querySelector('input[type=file]') as HTMLInputElement, photo);
  await user.click(go);
  expect(added.calls).toEqual([[7, expect.objectContaining({ first_name: 'Sam', last_name: 'Diaz', id_checked: true, photo, both_present: true, primary_approves: true })]]);
});
});

