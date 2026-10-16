import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import StaffApp from './StaffApp';

// Who is signed in: a cashier, or a manager (Members is for managers and up).
const auth = vi.hoisted(() => ({ user: { is_superuser: false, role: 'Employee' } as { is_superuser: boolean; role: string } }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

// Finalize is tested on its own (FinalizeThriftPlusPage.test.tsx): here, a stand-in that can say "part way through".
vi.mock('../finalize/FinalizeThriftPlusPage', () => ({
  default: ({ onMidway }: { onMidway?: (midway: boolean) => void }) => (
    <div data-testid="finalize-thriftplus">
      <button type="button" onClick={() => onMidway?.(true)}>Start</button>
      <button type="button" onClick={() => onMidway?.(false)}>Done</button>
    </div>
  ),
}));
vi.mock('../../admin/users/MembersPanel', () => ({ default: () => <div data-testid="members-panel" /> }));

// jsdom has no camera: the test types a tag instead.
vi.mock('../scanner/useQrCamera', () => ({
  loadDetector: () => Promise.resolve(),
  useQrCamera: () => ({
    videoRef: { current: null }, status: 'live', error: '', decoder: 'native', wake: vi.fn(), restart: vi.fn(), poke: vi.fn(), zoom: null, switching: false,
  }),
}));
const lookup = vi.hoisted(() => ({ staffTagLookup: vi.fn() }));
vi.mock('../../../api/thriftplusStaffApp.api', () => lookup);

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function renderApp(path = '/staff/finalize') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/staff/*" element={<><StaffApp /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const LAMP = {
  sku: 'ITM0048211', title: 'Brass floor lamp', category: 'lighting', category_label: 'Lighting', details: [], retail_price: null,
  price: '90.00', reward: '13.00', member_price: '77.00', age_restricted: false, returnable: true, available: true,
};

beforeEach(() => {
  auth.user = { is_superuser: false, role: 'Employee' };
  lookup.staffTagLookup.mockReset().mockResolvedValue({ status: 'found', item: LAMP });
});

afterEach(() => {
  document.head.querySelectorAll('[data-thriftplus="app"]').forEach((el) => el.remove());
});

describe('Thrift+ Staff', () => {
  it('is its own home-screen app: the staff manifest, icon, title and dark colour in the head', () => {
    const { unmount } = renderApp();
    expect(document.head.querySelector('link[rel="manifest"]')).toHaveAttribute('href', '/staff/manifest.webmanifest');
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/staff/icons/apple-touch-icon.png');
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Thrift+ Staff');
    expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#111111');
    expect(document.title).toBe('Thrift+ Staff');
    unmount();
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it('has Finalize, Members, Scan and Join QR on the bottom bar, and the bar switches tabs', async () => {
    const user = userEvent.setup();
    auth.user = { is_superuser: false, role: 'Manager' };
    renderApp('/staff');
    const bar = screen.getByRole('navigation', { name: 'Thrift+ Staff' });
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Finalize', 'Members', 'Scan', 'Join QR']);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff/finalize'));
    expect(screen.getByTestId('finalize-thriftplus')).toBeInTheDocument();

    await user.click(within(bar).getByText('Members'));
    expect(screen.getByTestId('where')).toHaveTextContent('/staff/members');
    expect(screen.getByTestId('members-panel')).toBeInTheDocument();

    await user.click(within(bar).getByText('Scan'));
    expect(screen.getByTestId('where')).toHaveTextContent('/staff/scan');
    expect(screen.getByTestId('staff-scan')).toBeInTheDocument();

    await user.click(within(bar).getByText('Finalize'));
    expect(screen.getByTestId('where')).toHaveTextContent('/staff/finalize');
  });

  it('opens the Join QR full screen without leaving the tab', async () => {
    const user = userEvent.setup();
    renderApp('/staff/finalize');
    await user.click(screen.getByTestId('staff-tab-join'));
    expect(await screen.findByTestId('finalize-join-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('finalize-join-url')).toHaveTextContent('ecothrift.us/join');
    expect(screen.getByTestId('where')).toHaveTextContent('/staff/finalize');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('finalize-join-sheet')).toBeNull());
  });

  it('hides the bar while someone is part way through Finalize (a customer holds the phone to sign)', async () => {
    const user = userEvent.setup();
    renderApp('/staff/finalize');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.queryByRole('navigation', { name: 'Thrift+ Staff' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('navigation', { name: 'Thrift+ Staff' })).toBeInTheDocument();
  });

  it('Members is for managers: a cashier sees who to ask', () => {
    renderApp('/staff/members');
    expect(screen.getByTestId('staff-members-managers')).toHaveTextContent('Finding members is for managers.');
    expect(screen.queryByTestId('members-panel')).toBeNull();
  });

  it('the test scanner shows the item card for a typed tag: price, ThriftBucks, 3-day returns', async () => {
    const user = userEvent.setup();
    renderApp('/staff/scan');
    await user.click(screen.getByText('Type tag #'));
    await user.type(screen.getByLabelText('Tag number'), 'itm0048211{Enter}');
    expect(lookup.staffTagLookup).toHaveBeenCalledWith('ITM0048211');
    const card = await screen.findByTestId('scan-card');
    expect(card).toHaveTextContent('Brass floor lamp');
    expect(card).toHaveTextContent('$90');
    expect(within(card).getByTestId('reward-band')).toHaveTextContent('ThriftBucks back');
    expect(within(card).queryByTestId('price-feel')).toBeNull(); // staff don't send price feels
    await user.click(screen.getByTestId('staff-scan-as-guest'));
    expect(within(card).getByTestId('reward-band')).toHaveTextContent('ThriftBucks for members');
    await act(async () => {
      await user.click(screen.getByTestId('scan-again'));
    });
    expect(screen.queryByTestId('scan-card')).toBeNull();
  });

  it('the test scanner answers a tag we cannot find', async () => {
    const user = userEvent.setup();
    lookup.staffTagLookup.mockResolvedValue({ status: 'not_found', sku: 'ITM9999999' });
    renderApp('/staff/scan');
    await user.click(screen.getByText('Type tag #'));
    await user.type(screen.getByLabelText('Tag number'), 'ITM9999999{Enter}');
    expect(await screen.findByTestId('answer-not-found')).toHaveTextContent("We can't find that item");
  });
});
