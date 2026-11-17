import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportSomethingButton } from './ReportSomethingButton';

const state = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../pages/hr/incidents/IncidentForm', () => ({
  IncidentForm: ({ open }: { open: boolean }) => (open ? <div>incident form</div> : null),
}));

function renderButton() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <ReportSomethingButton />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('ReportSomethingButton (#183)', () => {
  beforeEach(() => {
    state.user = { id: 7, role: 'Employee', is_superuser: false };
  });

  it('opens the incident form in one tap for staff', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Report something' }));
    expect(screen.getByText('incident form')).toBeInTheDocument();
  });

  it('is not shown to a consignee', () => {
    state.user = { id: 8, role: 'Consignee', is_superuser: false };
    renderButton();
    expect(screen.queryByTestId('report-something')).toBeNull();
  });
});
