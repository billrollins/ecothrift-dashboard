import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Sign } from '../../types/signage.types';
import SignagePage from './SignagePage';

const state = vi.hoisted(() => ({
  user: { role: 'Employee', is_superuser: false } as Record<string, unknown>,
  signs: [] as Sign[],
  updateSign: vi.fn(),
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
    id, name, status, status_label: labels[status], copies_up: 0, note: '', pdf_name: null, pdf_size: null, pins: 0,
    created_at: '', updated_at: '', ...extra,
  };
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/facilities/signage']}>
          <SignagePage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SignagePage (#106)', () => {
  beforeEach(() => {
    state.user = { role: 'Employee', is_superuser: false };
    state.updateSign.mockReset();
    state.signs = [
      sign(1, 'Thrift+ Meet', 'up', { copies_up: 2, pins: 2, pdf_name: 'meet.pdf' }),
      sign(2, 'Restrooms', 'to_make'),
    ];
  });

  it('staff see every sign, its status, copies, spots and Print, but no editing', () => {
    renderPage();
    expect(screen.getByText('Thrift+ Meet')).toBeTruthy();
    expect(screen.getByText('2 up · 2 spots on the map')).toBeTruthy();
    expect(screen.getByText('0 up · not on the map')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
    expect(screen.getByText('No PDF yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New sign/ })).toBeNull();
    expect(screen.queryByLabelText('Edit Restrooms')).toBeNull();
    expect(screen.getByText('The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).')).toBeTruthy();
  });

  it('filters by status', async () => {
    renderPage();
    await userEvent.click(screen.getByText('To make (1)'));
    expect(screen.queryByText('Thrift+ Meet')).toBeNull();
    expect(screen.getByText('Restrooms')).toBeTruthy();
  });

  it('managers get New sign, edit buttons and a status picker', () => {
    state.user = { role: 'Manager', is_superuser: false };
    renderPage();
    expect(screen.getByRole('button', { name: /New sign/ })).toBeTruthy();
    expect(screen.getByLabelText('Edit Restrooms')).toBeTruthy();
    expect(screen.getByLabelText('Add the PDF of Restrooms')).toBeTruthy();
    expect(screen.getByLabelText('Replace the PDF of Thrift+ Meet')).toBeTruthy();
  });
});
