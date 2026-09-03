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
        title="My section daily check"
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
          title="Work cycle"
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
  it('shows the shared walk and Choose another on a named aisle', () => {
    demo('owner_spot');
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another' })).toBeInTheDocument();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
    expect(screen.getByText('Drawn at random today')).toBeInTheDocument();
  });

  it('titles an empty week NO SECTIONS LEFT TO CHECK and keeps the Choose another slot', () => {
    const empty = previewSpot();
    empty.audit = previewAudit('', 0);
    empty.checks = empty.checks.map((check) => ({ ...check, result: 'pass' as const }));
    render(
      <OwnerSpotRunner
        title="Owner spot check"
        subject=""
        responses={empty}
        taxonomy={PREVIEW_TAXONOMY}
        reroll={{ onClick: () => undefined, disabled: true }}
      />,
    );
    expect(screen.getAllByText('NO SECTIONS LEFT TO CHECK').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Choose another' })).toBeDisabled();
    expect(screen.queryByText('How many items did you look at')).not.toBeInTheDocument();
  });
});
