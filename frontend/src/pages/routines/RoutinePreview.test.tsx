import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RoutinePreview } from './RoutinePreview';
import { OwnerSpotRunner } from './runners/OwnerSpotRunner';
import { PREVIEW_TAXONOMY, previewAudit, previewSpot } from './runners/previewFixtures';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, language: 'en' } }),
}));

const AISLES = [
  { id: 11, name: 'Aisle A' },
  { id: 22, name: 'Aisle B' },
];

function demo(kind: 'section_tally' | 'section_audit' | 'owner_spot', sections = AISLES) {
  return render(
    <MemoryRouter>
      <RoutinePreview
        title="Section check"
        definition={null}
        kind={kind}
        mode="demo"
        taxonomy={PREVIEW_TAXONOMY}
        sections={sections}
      />
    </MemoryRouter>,
  );
}

describe('Daily Check demo', () => {
  it('shows one real aisle, Choose another, and the Demo bar', async () => {
    const user = userEvent.setup();
    demo('section_tally');

    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
    expect(screen.queryByText('Sample section')).not.toBeInTheDocument();
    expect(screen.queryByText('Second sample')).not.toBeInTheDocument();

    const namedA = screen.queryAllByText('Aisle A').length > 0;
    const namedB = screen.queryAllByText('Aisle B').length > 0;
    expect(namedA !== namedB).toBe(true);

    const first = namedA ? 'Aisle A' : 'Aisle B';
    const other = first === 'Aisle A' ? 'Aisle B' : 'Aisle A';
    await user.click(screen.getByRole('button', { name: 'One more Blocking or hiding items behind' }));
    expect(screen.getByText('1 of 1 walked')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(screen.getAllByText(other).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(first)).toHaveLength(0);
    expect(screen.getByText('0 of 1 walked')).toBeInTheDocument();
  });

  it('disables Choose another when there is no other aisle', () => {
    demo('section_tally', [{ id: 11, name: 'Aisle A' }]);
    expect(screen.getByRole('button', { name: 'Choose another' })).toBeDisabled();
  });
});

describe('Demo chrome', () => {
  it('has no Cancel and stays stable with no floor sections', () => {
    render(
      <MemoryRouter>
        <RoutinePreview
          title="Register activity"
          definition={null}
          kind="work_cycle"
          mode="demo"
          taxonomy={PREVIEW_TAXONOMY}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText('What did you do?')).toBeInTheDocument();
  });
});

describe('Tuesday demo', () => {
  it('walks the assigned aisle without Choose another', () => {
    demo('section_audit');
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose another' })).not.toBeInTheDocument();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
  });
});

describe('Owner spot walk', () => {
  it('shows the shared walk and Switch on a named aisle', () => {
    demo('owner_spot');
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch' })).toBeInTheDocument();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
    expect(screen.getByText('Drawn at random today')).toBeInTheDocument();
  });

  it('waits when nothing has been tallied yet', () => {
    const empty = previewSpot();
    empty.audit = previewAudit('', 0);
    empty.checks = empty.checks.map((check) => ({ ...check, result: 'pass' as const }));
    render(
      <OwnerSpotRunner
        title="Spot walk"
        subject=""
        responses={empty}
        taxonomy={PREVIEW_TAXONOMY}
        spotState="waiting"
        reroll={{ onClick: () => undefined, disabled: true }}
      />,
    );
    expect(screen.getAllByText('Nothing tallied yet, check back later').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Switch' })).toBeDisabled();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
  });
});

describe('B-Stock pull preview', () => {
  it('is a static picture that never calls the server', async () => {
    const buying = await import('../../api/buying.api');
    const fetchSpy = vi.spyOn(buying, 'fetchManifestPull');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { SnackbarProvider } = await import('notistack');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SnackbarProvider>
          <MemoryRouter>
            <RoutinePreview title="Pull B-Stock manifests" definition={null} kind="bstock_pull" mode="demo" />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('1. Log in to B-Stock')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pull manifests' })).toHaveProperty('disabled', true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
