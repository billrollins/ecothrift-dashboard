import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import RoutinesPage from './RoutinesPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'Employee', is_superuser: false, full_name: 'Pat' } }),
}));

vi.mock('../../hooks/useRoutines', () => ({
  useMyRoutineRuns: () => ({
    data: { open: [], done: [], on_demand: [] },
    isLoading: false,
    isError: false,
  }),
  useRoutines: () => ({ data: [], isLoading: false, isError: false }),
  useRoutineRun: () => ({ data: null, isLoading: false, isError: false }),
  useRoutine: () => ({ data: null, isLoading: false, isError: false }),
}));

describe('RoutinesPage', () => {
  it('always renders every group so the list cannot jump', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RoutinesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('My Routines')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('On demand')).toBeInTheDocument();
    expect(screen.getByText('Done this week')).toBeInTheDocument();
    expect(screen.getByText('Nothing blocking the floor')).toBeInTheDocument();
  });
});
