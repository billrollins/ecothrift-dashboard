import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { TarsHoldDialog } from './TarsHoldDialog';

let liveOrders: RestorationPartsOrderDTO[] = [];

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({ data: [], isLoading: false }),
  useItemNotes: () => ({ data: [], isLoading: false }),
  useAppendItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useRestorationBench', () => ({
  useRestorationPartsOrders: () => ({ data: liveOrders, isLoading: false }),
}));

function carbOrder(): RestorationPartsOrderDTO {
  return {
    id: 9,
    job: 4,
    name: 'Carb kit',
    status: 'requested',
    target_grade: 'Working',
    lines: [
      {
        id: 1,
        part_id: 1,
        description: 'Carb',
        url: '',
        category: 'parts',
        qty: 1,
        unit_price: '6.00',
        unit_cost: '6.00',
        line_total: '6.00',
      },
    ],
  } as RestorationPartsOrderDTO;
}

function renderHold(overrides: Partial<ComponentProps<typeof TarsHoldDialog>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <TarsHoldDialog
      open
      itemLabel="ITM0190776"
      jobId={4}
      itemId={9}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe('TarsHoldDialog', () => {
  beforeEach(() => {
    liveOrders = [];
  });

  it('shows the SKU, notes, and add chips with submit blocked', () => {
    renderHold();
    expect(screen.getByText('ITM0190776')).toBeInTheDocument();
    expect(screen.getByText('Why it waits')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Time' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Place on hold' })).toBeDisabled();
  });

  it('needs a description on an added wait piece', async () => {
    const user = userEvent.setup({ delay: null });
    renderHold();
    await user.click(screen.getByRole('button', { name: 'Time' }));
    expect(screen.getByRole('button', { name: 'Place on hold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Time' })).toBeDisabled();
  });

  it('submits a wait piece and Holding Rack', async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmit } = renderHold();

    await user.click(screen.getByRole('button', { name: 'Space' }));
    await user.type(screen.getByPlaceholderText('Where it needs to sit'), 'needs the big bench');
    await user.click(screen.getByRole('button', { name: 'Holding Rack' }));
    await user.click(screen.getByRole('button', { name: 'Place on hold' }));

    expect(onSubmit).toHaveBeenCalledWith({
      waitFor: { time: '', space: 'needs the big bench', help: '', other: '' },
      storageLocation: 'Holding Rack',
    });
  });

  it('auto-adds a Buy piece from a live request and that is enough to hold', async () => {
    liveOrders = [carbOrder()];
    const user = userEvent.setup({ delay: null });
    const { onSubmit } = renderHold();

    expect(screen.getByText('Parts')).toBeInTheDocument();
    expect(screen.getByText('Carb kit')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(
      screen.getByText('Parts').compareDocumentPosition(screen.getByText('Carb kit'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText('Carb kit').compareDocumentPosition(screen.getByText('Requested'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Place on hold' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Place on hold' }));
    expect(onSubmit).toHaveBeenCalledWith({
      waitFor: { time: '', space: '', help: '', other: '' },
      storageLocation: '',
    });
  });
});
