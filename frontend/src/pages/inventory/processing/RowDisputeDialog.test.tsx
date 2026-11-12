import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowDisputesResponse } from '../../../api/rowDisputes.api';
import { RowDisputeDialog } from './RowDisputeDialog';
import {
  disputeRetail, initialRowDisputeForm, rowDisputePayload, rowDisputePhotos, rowDisputeProblems, type RowDisputeForm,
} from './rowDispute';

const api = vi.hoisted(() => ({
  getRowDisputes: vi.fn(),
  createRowDispute: vi.fn(),
  undoRowDispute: vi.fn(),
  rowDisputesKey: (o: number, r: number) => ['row-disputes', o, r],
}));
vi.mock('../../../api/rowDisputes.api', () => api);
vi.mock('../../../components/photos/photoFile', async (orig) => ({
  ...(await orig<typeof import('../../../components/photos/photoFile')>()),
  shrinkPhoto: async (blob: Blob) => blob,
  markPhotosUsed: vi.fn(async () => undefined),
}));

const REASONS: RowDisputesResponse['reasons'] = [
  { value: 'did_not_come', label: 'Did not come', partial: false, photos: false },
  { value: 'broken', label: 'Arrived broken', partial: false, photos: true },
  { value: 'wrong_item', label: 'Wrong item came', partial: false, photos: true },
  { value: 'missing_parts', label: 'Missing parts', partial: true, photos: true },
  { value: 'other', label: 'Other problem', partial: true, photos: true },
];

const answer = (over: Partial<RowDisputesResponse['row']> = {}, disputes: RowDisputesResponse['disputes'] = []): RowDisputesResponse => ({
  row: { processing_row_id: 7, row_number: 12, title: 'Keurig K-Mini', quantity: 5, remaining: 5, unit_retail: '80.00', disputed: 0, ...over },
  disputes,
  reasons: REASONS,
  default_pct_lost: 50,
  photos_max: 6,
});

const photo = () => new File(['jpeg'], 'cracked.jpg', { type: 'image/jpeg' });
const form = (over: Partial<RowDisputeForm>): RowDisputeForm => ({ ...initialRowDisputeForm(5), ...over });

function show(items?: Array<{ id: number; sku: string }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RowDisputeDialog open orderId={3} processingRowId={7} items={items} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('row dispute rules', () => {
  it('starts on "did not come" with every unit left', () => {
    expect(initialRowDisputeForm(5)).toEqual({ reason: 'did_not_come', units: '5', pctLost: '50', note: '', photos: [] });
  });

  it('says plainly what is wrong', () => {
    const f = initialRowDisputeForm(5);
    expect(rowDisputeProblems(f, 5)).toEqual([]);
    expect(rowDisputeProblems({ ...f, units: '0' }, 5)[0]).toMatch(/how many units/);
    expect(rowDisputeProblems({ ...f, units: '6' }, 5)[0]).toBe('Only 5 units left on this row.');
    expect(rowDisputeProblems({ ...f, reason: 'other', pctLost: '0', photos: [photo()] }, 5)[0]).toMatch(/1 to 100%/);
    expect(rowDisputeProblems(f, 0)[0]).toMatch(/Nothing left/);
  });

  it('every reason but "did not come" needs a photo', () => {
    for (const reason of ['broken', 'wrong_item', 'missing_parts', 'other'] as const) {
      expect(rowDisputeProblems(form({ reason }), 5)).toEqual([
        'Add a photo of the problem. Every reason but "did not come" needs at least one.',
      ]);
      expect(rowDisputeProblems(form({ reason, photos: [photo()] }), 5)).toEqual([]);
    }
    // Photos picked and then switched back to "did not come" are not sent.
    expect(rowDisputePhotos(form({ reason: 'did_not_come', photos: [photo()] }))).toEqual([]);
    expect(rowDisputePhotos(form({ reason: 'broken', photos: [photo()] }))).toHaveLength(1);
  });

  it('sends the % only for partial reasons, and the note only when there is one', () => {
    expect(rowDisputePayload(7, initialRowDisputeForm(3))).toEqual({ processing_row_id: 7, reason: 'did_not_come', units: 3 });
    expect(rowDisputePayload(7, form({ reason: 'missing_parts', units: '2', pctLost: '25', note: ' no lid ' })))
      .toEqual({ processing_row_id: 7, reason: 'missing_parts', units: 2, pct_lost: 25, note: 'no lid' });
    expect(disputeRetail(form({ reason: 'missing_parts', units: '2', pctLost: '25' }), '80.00')).toBe(40);
    expect(disputeRetail(initialRowDisputeForm(3), '80.00')).toBe(240);
  });
});

describe('Dispute row window', () => {
  beforeEach(() => {
    api.getRowDisputes.mockReset();
    api.createRowDispute.mockReset();
    api.undoRowDispute.mockReset();
  });

  it('disputes units that did not come with nothing else to fill', async () => {
    api.getRowDisputes.mockResolvedValue(answer());
    api.createRowDispute.mockResolvedValue({ ...answer({ remaining: 3, disputed: 2 }), dispute: {} });
    const { onClose } = show();
    const units = await screen.findByLabelText('How many units');
    await waitFor(() => expect(units).toHaveValue('5'));
    await userEvent.clear(units);
    await userEvent.type(units, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Dispute 2 units' }));
    await waitFor(() => expect(api.createRowDispute).toHaveBeenCalledWith(3, { processing_row_id: 7, reason: 'did_not_come', units: 2 }, []));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId('row-dispute-photos')).not.toBeInTheDocument();     // nothing to take a picture of
  });

  it('arrived broken asks for a photo, and sends it with the dispute', async () => {
    api.getRowDisputes.mockResolvedValue(answer());
    api.createRowDispute.mockResolvedValue({ ...answer({ remaining: 4, disputed: 1 }), dispute: {} });
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const { onClose } = show();
    const units = await screen.findByLabelText('How many units');
    await waitFor(() => expect(units).toHaveValue('5'));
    await userEvent.click(screen.getByRole('button', { name: 'Arrived broken' }));
    await userEvent.clear(units);
    await userEvent.type(units, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Dispute 1 unit' }));
    expect(screen.getByText('Add a photo of the problem. Every reason but "did not come" needs at least one.')).toBeInTheDocument();
    expect(api.createRowDispute).not.toHaveBeenCalled();

    const file = photo();
    await userEvent.upload(screen.getByTestId('row-dispute-photo'), file);
    expect(await screen.findAllByTestId('picked-photo')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Dispute 1 unit' }));
    await waitFor(() => expect(api.createRowDispute).toHaveBeenCalled());
    const [orderId, body, sent] = api.createRowDispute.mock.calls[0];
    expect([orderId, body]).toEqual([3, { processing_row_id: 7, reason: 'broken', units: 1 }]);
    expect(sent).toHaveLength(1);
    expect((sent as File[])[0].name).toBe('cracked.jpg');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a partial reason asks how much value is lost', async () => {
    api.getRowDisputes.mockResolvedValue(answer());
    show();
    await screen.findByLabelText('How many units');
    expect(screen.queryByLabelText('Value lost')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Missing parts' }));
    expect(screen.getByLabelText('Value lost')).toHaveValue('50');
  });

  it('too many units is refused in plain words, before anything is sent', async () => {
    api.getRowDisputes.mockResolvedValue(answer());
    show();
    const units = await screen.findByLabelText('How many units');
    await waitFor(() => expect(units).toHaveValue('5'));
    await userEvent.clear(units);
    await userEvent.type(units, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Dispute 9 units' }));
    expect(screen.getByText('Only 5 units left on this row.')).toBeInTheDocument();
    expect(api.createRowDispute).not.toHaveBeenCalled();
  });

  it('Mark as disputed: one checked-in item, no units, no "did not come", already disputed items left out', async () => {
    const taken = { id: 50, photos: [], item_id: 901, item_sku: 'ITM-A', reason: 'broken' as const, reason_label: 'Arrived broken',
      units: 1, pct_lost: 100, note: '', by: 'Dana Tester', at: '2026-11-12T18:00:00Z', undone_at: null, undone_by: '' };
    api.getRowDisputes.mockResolvedValue(answer({ remaining: 0 }, [taken]));
    api.createRowDispute.mockResolvedValue({ ...answer({ remaining: 0 }), dispute: {} });
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const { onClose } = show([{ id: 901, sku: 'ITM-A' }, { id: 902, sku: 'ITM-B' }]);
    expect(await screen.findByText('ITM-A · Arrived broken')).toBeInTheDocument();
    expect(screen.queryByLabelText('How many units')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Did not come' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ITM-A' })).not.toBeInTheDocument();      // already disputed
    await userEvent.click(screen.getByRole('button', { name: 'Missing parts' }));
    await userEvent.upload(screen.getByTestId('row-dispute-photo'), photo());
    await userEvent.click(await screen.findByRole('button', { name: 'Dispute ITM-B' }));
    await waitFor(() => expect(api.createRowDispute).toHaveBeenCalled());
    expect(api.createRowDispute.mock.calls[0][1]).toEqual(
      { processing_row_id: 7, item_id: 902, reason: 'missing_parts', units: 1, pct_lost: 50 },
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('lists the row\'s disputes and Undo puts the units back', async () => {
    const d = { id: 41, photos: [], item_id: null, item_sku: '', reason: 'did_not_come' as const, reason_label: 'Did not come', units: 5, pct_lost: 100, note: 'never came',
      by: 'Dana Tester', at: '2026-11-11T18:00:00Z', undone_at: null, undone_by: '' };
    api.getRowDisputes.mockResolvedValue(answer({ remaining: 0, disputed: 5 }, [d]));
    api.undoRowDispute.mockResolvedValue(answer({ remaining: 5, disputed: 0 }, [{ ...d, undone_at: '2026-11-11T19:00:00Z', undone_by: 'Dana Tester' }]));
    show();
    expect(await screen.findByText(/Nothing is left to process on this row/)).toBeInTheDocument();
    expect(screen.getByText('5 · Did not come')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.undoRowDispute).toHaveBeenCalledWith(3, 41));
    expect(await screen.findByText('5 left to process')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
