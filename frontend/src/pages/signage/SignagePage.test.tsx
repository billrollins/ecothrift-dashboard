import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Sign, SignVersion } from '../../types/signage.types';
import SignagePage from './SignagePage';

const state = vi.hoisted(() => ({
  user: { id: 7, role: 'Employee', is_superuser: false } as Record<string, unknown>,
  signs: [] as Sign[],
  updateSign: vi.fn(),
  rank: vi.fn(),
  vote: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../hooks/useSignage', () => {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    signsQueryKey: ['signage-signs'],
    useSigns: () => ({ data: state.signs, isLoading: false, isError: false }),
    useCreateSign: idle,
    useUpdateSign: () => ({ mutate: state.updateSign, mutateAsync: vi.fn(), isPending: false }),
    useDeleteSign: idle,
    useUploadSignPdf: idle,
    useRemoveSignPdf: idle,
    useVoteNeeded: () => ({ mutate: state.vote, isPending: false }),
    useRankVersion: () => ({ mutate: state.rank, isPending: false }),
    useClearRanks: idle,
    useAddSignNote: idle,
    useDeleteSignNote: idle,
    useAddSignVersion: idle,
    useDeleteSignVersion: idle,
    useApproveSign: idle,
    useSignPreview: () => ({ url: null, isLoading: false, isError: false }),
  };
});
vi.mock('../../hooks/useFloorplans', () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useStoreMap: () => ({ data: { plan: null, layers: [], pins: [], locations: [] } }),
    useCreateMapPin: idle,
    useUpdateMapPin: idle,
    useDeleteMapPin: idle,
  };
});
vi.mock('../../hooks/useFloorplanAssets', () => ({ useFloorPlanAssets: () => ({ data: [] }) }));
vi.mock('../../hooks/useFloorplanElementKinds', () => ({ useFloorPlanElementKinds: () => ({ data: undefined }) }));

function sign(id: number, name: string, status: Sign['status'], extra: Partial<Sign> = {}): Sign {
  const labels = { to_make: 'To make', printed: 'Printed', up: 'Up' } as const;
  return {
    id, name, stage: 'production', kind: 'sign', slug: null, dash_update: null, location: '', quantity: 1, status, status_label: labels[status], copies_up: 0, note: '',
    pdf_name: null, pdf_size: null, pins: 0, versions: [], chosen_version: null, preview_version: null, votes: null,
    notes: [], approved_at: null, created_at: '', updated_at: '', ...extra,
  };
}

function version(id: number, label: string, extra: Partial<SignVersion> = {}): SignVersion {
  return {
    id, label, position: id, has_pdf: true, has_preview: false, pdf_name: `${label}.pdf`, my_rank: null,
    avg_rank: null, rankers: null, firsts: null, ...extra,
  };
}

function renderPage(url = '/facilities/signage') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[url]}>
          <SignagePage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

const PROD = '/facilities/signage?tab=production';

describe('SignagePage: Production (#106, #122)', () => {
  beforeEach(() => {
    state.user = { id: 7, role: 'Employee', is_superuser: false };
    state.updateSign.mockReset();
    state.signs = [
      sign(1, 'Thrift+ Meet', 'up', { copies_up: 2, pins: 2, pdf_name: 'meet.pdf', location: 'Front door' }),
      sign(2, 'Restrooms', 'to_make'),
    ];
  });

  it('staff see compact rows with status, copies and spots, but no editing', () => {
    renderPage(PROD);
    expect(screen.getByText('Thrift+ Meet')).toBeTruthy();
    expect(screen.getByText('Front door · 2 up · 2 on the map')).toBeTruthy();
    expect(screen.getByText('0 up · not on the map')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New sign/ })).toBeNull();
    expect(screen.queryByLabelText('Status of Restrooms')).toBeNull();
    expect(screen.getByText('The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).')).toBeTruthy();
  });

  it('opening a sign shows Print and Download', async () => {
    renderPage(PROD);
    await userEvent.click(screen.getByLabelText('Open Thrift+ Meet'));
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByLabelText('Edit Thrift+ Meet')).toBeNull();
  });

  it('filters by status', async () => {
    renderPage(PROD);
    await userEvent.click(screen.getByText('To make (1)'));
    expect(screen.queryByText('Thrift+ Meet')).toBeNull();
    expect(screen.getByText('Restrooms')).toBeTruthy();
  });

  it('managers get New sign, a status picker and edit tools', async () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    renderPage(PROD);
    expect(screen.getByRole('button', { name: /New sign/ })).toBeTruthy();
    expect(screen.getByLabelText('Status of Restrooms')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Open Restrooms'));
    expect(screen.getByLabelText('Edit Restrooms')).toBeTruthy();
    expect(screen.getByLabelText('Add the PDF of Restrooms')).toBeTruthy();
  });
});

describe('SignagePage: Drafts (#122)', () => {
  beforeEach(() => {
    state.user = { id: 7, role: 'Employee', is_superuser: false };
    state.rank.mockReset();
    state.vote.mockReset();
    state.signs = [
      sign(10, 'You are on camera', 'to_make', {
        stage: 'draft', location: 'Entrance', quantity: 8,
        versions: [version(1, 'A'), version(2, 'B')],
        votes: { my_needed: null, has_voted: false, results: null },
      }),
      sign(11, 'Sold AS IS', 'to_make', {
        stage: 'draft', quantity: 3,
        versions: [version(3, 'C', { my_rank: 2, avg_rank: 1.8 }), version(4, 'D', { my_rank: 1, avg_rank: 1.2, firsts: 3 })],
        votes: {
          my_needed: true, has_voted: true,
          results: { needed_yes: 3, needed_no: 1, needed_pct: 75, voters: 4, top_version_id: 4, top_version_label: 'D' },
        },
      }),
      sign(1, 'Thrift+ Meet', 'up'),
    ];
  });

  it('drafts are their own tab: Vote on the best until you vote, then % needed and the top runner', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Drafts (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Production (1)' })).toBeTruthy();
    expect(screen.queryByText('Thrift+ Meet')).toBeNull();
    expect(screen.getByText('Entrance · 8 needed · 2 versions')).toBeTruthy();
    expect(screen.getByText('Vote on the best')).toBeTruthy();
    expect(screen.getByText('75% needed')).toBeTruthy();
    expect(screen.getByText('Top: D')).toBeTruthy();
  });

  it('a draft you have not voted on hides the results and lets you pick the best', async () => {
    renderPage('/facilities/signage?draft=10');
    expect(screen.getByText('Say yes or no and pick the best to see how everyone voted.')).toBeTruthy();
    expect(screen.queryByText(/Avg rank/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(state.vote).toHaveBeenCalledWith({ id: 10, needed: true }, expect.anything());
    await userEvent.click(screen.getAllByRole('button', { name: 'Best' })[1]);
    expect(state.rank).toHaveBeenCalledWith({ id: 10, version: 2 }, expect.anything());
    expect(screen.queryByText('Approve into production')).toBeNull();
  });

  it('after voting: best on the left, your rank in the corner, everyone\'s numbers', () => {
    renderPage('/facilities/signage?draft=11');
    expect(screen.getByText('75% say yes (3 yes, 1 no)')).toBeTruthy();
    const labels = screen.getAllByText(/^Avg rank/).map((el) => el.textContent);
    expect(labels).toEqual(['Avg rank 1.2 · best for 3', 'Avg rank 1.8']);
    expect(screen.getByLabelText('Your rank 1')).toBeTruthy();
    expect(screen.getByLabelText('Your rank 2')).toBeTruthy();
  });

  it('managers approve a draft into production', () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    renderPage('/facilities/signage?draft=11');
    expect(screen.getByRole('button', { name: 'Approve into production' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a version' })).toBeTruthy();
  });
});
