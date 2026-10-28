import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckInUndoPreview } from '../../../api/inventory.api';
import { CheckInUndoDialog } from './CheckInUndoDialog';

const api = vi.hoisted(() => ({
  getCheckInUndoPreview: vi.fn(),
  undoItemCheckIn: vi.fn(),
}));

vi.mock('../../../api/inventory.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/inventory.api')>()),
  ...api,
}));

const preview: CheckInUndoPreview = {
  item_check_in_id: 12811,
  purchase_order_id: 420,
  purchase_order_number: 'AMZ-1',
  product_id: 7,
  product_title: 'Solar Wind Spinner',
  quantity: 11,
  skus: [],
  dispatch: 'restoration',
  where: { restoration: 11 },
  created_at: '2026-10-23T13:55:46Z',
  created_by: 'Ashley',
  processing_row_id: 24790,
  processing_row_number: 10,
  pending_now: 0,
  pending_after_delete: 0,
  restoration_job: { id: 214, stage: 'queued' },
  destinations: ['back_storage', 'on_shelf', 'online_sales', 'processing', 'salvage'],
  blocks: [],
};

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SnackbarProvider>
        <CheckInUndoDialog target={{ orderId: 420, itemCheckInId: 12811 }} onClose={vi.fn()} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('CheckInUndoDialog', () => {
  beforeEach(() => {
    api.getCheckInUndoPreview.mockReset();
    api.undoItemCheckIn.mockReset();
  });

  it('moves the whole check-in out of Restoration to the floor by default', async () => {
    const user = userEvent.setup();
    api.getCheckInUndoPreview.mockResolvedValue({ data: preview });
    api.undoItemCheckIn.mockResolvedValue({
      data: { row: null, workspace_patch: {}, undo: { id: 1, action: 'move', quantity: 11, to: 'on_shelf' } },
    });
    renderDialog();
    expect(await screen.findByText('11 × Solar Wind Spinner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Move 11 to On shelf/ }));
    expect(api.undoItemCheckIn).toHaveBeenCalledWith(420, 12811, { action: 'move', dispatch: 'on_shelf' });
  });

  it('says what blocks the undo and offers no action', async () => {
    api.getCheckInUndoPreview.mockResolvedValue({ data: { ...preview, blocks: ['1 sold (ITM1).'] } });
    renderDialog();
    expect(await screen.findByText('1 sold (ITM1).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move|Delete/ })).toBeNull();
  });
});
