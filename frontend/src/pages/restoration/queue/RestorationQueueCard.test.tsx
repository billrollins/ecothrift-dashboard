import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { isQueueHistorySelectTarget, RestorationQueueCard } from './RestorationQueueCard';

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({ data: [], isLoading: false }),
  useItemNotes: () => ({ data: [], isLoading: false }),
  useAppendItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function formJob(): RestorationJobDTO {
  return {
    id: 11,
    stage: 'queued',
    sku: 'ET-11',
    name: 'Hair dryer',
    items: [{ id: 1, sku: 'ET-11', status: 'in_stock', condition: '', location: '' }],
    grade_values: { Working: 29 },
    scale: 'Functional',
    queue_note: '',
    intended_destination: 'shelf',
    retail: '40',
    category: 'Electronics',
    brand: 'Conair',
  } as unknown as RestorationJobDTO;
}

describe('isQueueHistorySelectTarget', () => {
  it('selects chrome, not inputs or Dispatch', () => {
    const chrome = document.createElement('div');
    expect(isQueueHistorySelectTarget(chrome)).toBe(true);

    const input = document.createElement('input');
    chrome.appendChild(input);
    expect(isQueueHistorySelectTarget(input)).toBe(false);

    const button = document.createElement('button');
    expect(isQueueHistorySelectTarget(button)).toBe(false);

    const option = document.createElement('div');
    option.setAttribute('data-press-option', '');
    expect(isQueueHistorySelectTarget(option)).toBe(false);
  });
});

describe('RestorationQueueCard form layout', () => {
  it('keeps the row fields and drops Waiting and Dispatch', () => {
    render(
      <RestorationQueueCard
        layout="form"
        job={formJob()}
        scales={{ Functional: ['Working', 'Repairable', 'Parts-only'] }}
        accent="#2e7d32"
        onEdit={vi.fn()}
        formAction={<button type="button">Done</button>}
      />,
    );

    expect(screen.getByText('ET-11')).toBeInTheDocument();
    expect(screen.getByText('Hair dryer')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByText('Nothing earlier.')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination for Hair dryer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shelf' })).toBeInTheDocument();
    expect(screen.getByLabelText('Grade scale for Hair dryer')).toBeInTheDocument();
    expect(screen.getByLabelText('Working price')).toBeInTheDocument();
    expect(screen.getByText('AT STAKE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText('$40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Price as dollars' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Price as percent of retail' })).toBeInTheDocument();
    expect(screen.queryByText('WAITING')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next for Hair dryer')).not.toBeInTheDocument();
  });

  it('shows Open, Hold, and Finish on a queue row', () => {
    render(
      <RestorationQueueCard
        job={formJob()}
        scales={{ Functional: ['Working', 'Repairable', 'Parts-only'] }}
        accent="#2e7d32"
        onEdit={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Dispatch Hair dryer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Hair dryer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold Hair dryer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish Hair dryer' })).toBeInTheDocument();
  });

  it('names whose bench a bench row is on', () => {
    render(
      <RestorationQueueCard
        job={{ ...formJob(), stage: 'bench', bench_owner_id: 3, bench_owner_name: 'Mike Chen' }}
        scales={{ Functional: ['Working', 'Repairable', 'Parts-only'] }}
        accent="#1565c0"
        onEdit={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("On Mike's bench")).toHaveTextContent('Mike');
  });

  it('opens the bench from chrome and history from the notes badge', async () => {
    const user = userEvent.setup();
    const onOpenWork = vi.fn();
    const onOpenHistory = vi.fn();
    render(
      <RestorationQueueCard
        job={{ ...formJob(), stage: 'bench' }}
        scales={{ Functional: ['Working', 'Repairable', 'Parts-only'] }}
        accent="#1565c0"
        onEdit={vi.fn()}
        onDispatch={vi.fn()}
        onOpenWork={onOpenWork}
        onOpenHistory={onOpenHistory}
      />,
    );

    expect(screen.getByLabelText('Unclaimed bench')).toHaveTextContent('Unclaimed');

    await user.click(screen.getByText('Hair dryer'));
    expect(onOpenWork).toHaveBeenCalledTimes(1);
    expect(onOpenHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Notes (0)' }));
    expect(onOpenHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }), 'notes');
  });

  it('toggles grade cells between dollars and percent of retail', async () => {
    const user = userEvent.setup();
    render(
      <RestorationQueueCard
        layout="form"
        job={formJob()}
        scales={{ Functional: ['Working', 'Repairable', 'Parts-only'] }}
        accent="#2e7d32"
        onEdit={vi.fn()}
        formAction={<button type="button">Done</button>}
      />,
    );

    const working = screen.getByLabelText('Working price') as HTMLInputElement;
    const dollars = screen.getByRole('button', { name: 'Price as dollars' });
    expect(working.value).toBe('29.00');
    await user.click(dollars);
    expect((screen.getByLabelText('Working price') as HTMLInputElement).value).toBe('72.50');
    await user.click(dollars);
    expect((screen.getByLabelText('Working price') as HTMLInputElement).value).toBe('29.00');
  });
});
