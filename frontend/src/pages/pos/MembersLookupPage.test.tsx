import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MembersLookupPage from './MembersLookupPage';

const m = vi.hoisted(() => ({ cards: [] as number[] }));

vi.mock('../../api/thriftplusRegister.api', () => ({
  findPendingOrMember: async () => ({
    people: [{
      person_id: 5, account_id: 1, first_name: 'Ana', last_name: 'Bell', email: '', joined_at: '2026-10-19T15:00:00Z',
      code_last4: '0008', code_display: '1000 0000 0008', status: 'active',
    }],
  }),
  getMemberCard: async (id: number) => {
    m.cards.push(id);
    return {
      person: {
        person_id: id, account_id: 1, first_name: 'Ana', last_name: 'Bell', name: 'Ana Bell', email: '', joined_at: '', code_last4: '0008',
        standing: 'member', role: 'primary', practice: false, verified_18: true,
      },
      rewards: { collected: '1.00', used: '0.00', balance: '1.00', usable_today: '1.00', use_by: null, credit: '0.00' },
      trips: [], people: [{ person_id: id, first_name: 'Ana', name: 'Ana Bell', role: 'primary', photo_url: null, verified_18: true }],
    };
  },
  thriftErrorMessage: (_e: unknown, fallback = 'error') => fallback,
}));

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[url]}>
            <MembersLookupPage />
          </MemoryRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('/pos/members (the member lookup page, owner 2026-10-20)', () => {
  it('starts on Find; picking someone shows their card; Find someone else goes back', async () => {
    const user = userEvent.setup();
    m.cards = [];
    renderAt('/pos/members');
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'ana{Enter}');
    await user.click(await screen.findByText('Ana Bell'));
    expect(await screen.findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
    expect(m.cards).toEqual([5]);
    await user.click(screen.getByTestId('members-find-another'));
    expect(screen.getByLabelText(/Scan a member QR, or type/)).toBeInTheDocument();
  });

  it('the deep link ?person=<id> opens that member\'s card straight away', async () => {
    m.cards = [];
    renderAt('/pos/members?person=42');
    expect(await screen.findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
    expect(m.cards).toEqual([42]);
    expect(screen.queryByLabelText(/Scan a member QR, or type/)).not.toBeInTheDocument();
  });

  it('a bad ?person value is just Find', () => {
    renderAt('/pos/members?person=abc');
    expect(screen.getByLabelText(/Scan a member QR, or type/)).toBeInTheDocument();
  });
});
