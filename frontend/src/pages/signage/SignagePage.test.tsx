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

function sign(id: number, name: string, extra: Partial<Sign> = {}): Sign {
  return {
    id, name, stage: 'production', kind: 'sign', slug: null, dash_update: null, location: '', quantity: 1, note: '',
    pdf_name: null, pdf_size: null, pins: 0, pins_up: 0, versions: [], chosen_version: null, preview_version: null, votes: null,
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

describe('SignagePage: Production (#106, #122, #129)', () => {
  beforeEach(() => {
    state.user = { id: 7, role: 'Employee', is_superuser: false };
    state.updateSign.mockReset();
    state.signs = [
      sign(1, 'Thrift+ Meet', { quantity: 3, pins: 2, pins_up: 1, pdf_name: 'meet.pdf', location: 'Front door' }),
      sign(2, 'Restrooms'),
    ];
  });

  it('#129: rows say how many spots are up, with no sign status', () => {
    renderPage(PROD);
    expect(screen.getByText('Thrift+ Meet')).toBeTruthy();
    expect(screen.getByText('1 of 2 up · 1 to place · Front door')).toBeTruthy();
    expect(screen.getByText('Not on the map')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New/ })).toBeNull();
    expect(screen.queryByText(/To make|Printed/)).toBeNull();
    expect(screen.getByText('The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).')).toBeTruthy();
  });

  it('#129: the drop-down holds Versions, Print and Download; staff get no editing', async () => {
    renderPage(PROD);
    await userEvent.click(screen.getByLabelText('Versions, print and more for Thrift+ Meet'));
    expect(screen.getByRole('menuitem', { name: /Versions \(0\)/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Print' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
  });

  it('#129: filters by To hang / All up', async () => {
    state.signs = [...state.signs, sign(3, 'Exit', { pins: 2, pins_up: 2 })];
    renderPage(PROD);
    expect(screen.getByText('To hang (2)')).toBeTruthy();
    await userEvent.click(screen.getByText('All up (1)'));
    expect(screen.queryByText('Thrift+ Meet')).toBeNull();
    expect(screen.getByText('Exit')).toBeTruthy();
  });

  it('#129: picking a sign keeps every row the same and the map bar names it', async () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    renderPage(PROD);
    expect(screen.getByRole('button', { name: /New/ })).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Open Restrooms'));
    expect(screen.getByLabelText('Open Restrooms').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/not on the map yet/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Versions, print and more for Restrooms'));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Add the PDF' })).toBeTruthy();
  });

  it('#128: only the owner switches the version of a theme (in the gallery)', async () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    state.signs = [
      sign(3, 'Kraft theme', { kind: 'theme', versions: [version(5, 'One'), version(6, 'Two')], chosen_version: 5, preview_version: 6 }),
      sign(4, 'Exit', { versions: [version(7, 'Red'), version(8, 'Blue')], chosen_version: 7, preview_version: 8 }),
    ];
    const view = renderPage(PROD);
    await userEvent.click(screen.getByLabelText('See Kraft theme larger'));
    // The gallery opens on the sign's picture; this one is not the version in use.
    expect(screen.getByText('Kraft theme: Two')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use this version' })).toBeNull();
    view.unmount();
    renderPage(PROD);
    await userEvent.click(screen.getByLabelText('See Exit larger'));
    expect(screen.getByRole('button', { name: 'Use this version' })).toBeTruthy();
  });
});

describe('SignagePage: Drafts (#122)', () => {
  beforeEach(() => {
    state.user = { id: 7, role: 'Employee', is_superuser: false };
    state.rank.mockReset();
    state.vote.mockReset();
    state.signs = [
      sign(10, 'You are on camera', {
        stage: 'draft', location: 'Entrance', quantity: 8,
        versions: [version(1, 'A'), version(2, 'B')],
        votes: { my_needed: null, has_voted: false, results: null, approve_block: 'Vote first' },
      }),
      sign(11, 'Sold AS IS', {
        stage: 'draft', quantity: 3,
        versions: [version(3, 'C', { my_rank: 2, avg_rank: 1.8 }), version(4, 'D', { my_rank: 1, avg_rank: 1.2, firsts: 3 })],
        votes: {
          my_needed: true, has_voted: true,
          results: { needed_yes: 3, needed_no: 1, needed_pct: 75, voters: 4, top_version_id: 4, top_version_label: 'D' },
          approve_block: null,
        },
      }),
      sign(1, 'Thrift+ Meet'),
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

  it('#128: the approve button stays in place, disabled, until 3 people (you included) have voted', () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    renderPage('/facilities/signage?draft=10');
    const button = screen.getByRole('button', { name: 'Vote first' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Approve into production' })).toBeNull();
  });

  it('#128: shows how many votes are missing', () => {
    state.user = { id: 1, role: 'Manager', is_superuser: false };
    const [, voted] = state.signs;
    state.signs[1] = { ...voted, votes: { ...voted.votes!, approve_block: 'Needs 2 more votes' } };
    renderPage('/facilities/signage?draft=11');
    expect((screen.getByRole('button', { name: 'Needs 2 more votes' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
