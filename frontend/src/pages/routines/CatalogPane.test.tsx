import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CatalogPane } from './CatalogPane';
import { fakeRoutine } from './routineFixture';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, language: 'en', is_superuser: true },
  }),
}));

vi.mock('../../hooks/useRoutines', () => ({
  useRoutines: () => ({
    data: [
      fakeRoutine({
        id: 4,
        title: 'Close',
        is_blocking: true,
        assigned_department_name: 'Retail',
      }),
    ],
    isLoading: false,
    isError: false,
  }),
}));

describe('CatalogPane', () => {
  it('shows View and no edit or delete', () => {
    render(
      <MemoryRouter initialEntries={['/routines/catalog']}>
        <CatalogPane desktop={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit routine')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete routine')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter routines')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New routine')).not.toBeInTheDocument();
  });
});
