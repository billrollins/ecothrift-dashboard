import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EnhancementRequestDTO } from '../../types/enhancementRequests.types';
import { RequestsBoard } from './RequestsBoard';
import { RequestsDrawer, RequestsDrawerTab } from './RequestsDrawer';
import { REQUEST_COLUMN_HEADINGS } from './requestsBoardLayout';

const rowsState = vi.hoisted(() => ({
  rows: [] as EnhancementRequestDTO[],
}));
const createMutate = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useEnhancementRequests', () => ({
  useEnhancementRequests: () => ({ data: rowsState.rows, isLoading: false }),
  useCreateEnhancementRequest: () => ({ mutate: createMutate, isPending: false }),
  useUpdateEnhancementRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useAddEnhancementRequestNote: () => ({ mutate: vi.fn(), isPending: false }),
}));

function request(over: Partial<EnhancementRequestDTO> = {}): EnhancementRequestDTO {
  return {
    id: 1,
    area: 'restoration',
    body: 'Need a parts bin.',
    submitted_by: 4,
    submitted_by_name: 'Mike Tars',
    status: 'open',
    priority: 'unset',
    target_date: null,
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    notes: [],
    can_edit: false,
    can_note: false,
    created_at: '2026-08-25T14:30:00Z',
    updated_at: '2026-08-25T14:30:00Z',
    ...over,
  };
}

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>{ui}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('RequestsDrawerTab', () => {
  it('is a grabber parked on the bottom edge that opens the sheet', async () => {
    const user = userEvent.setup({ delay: null });
    const onOpen = vi.fn();
    wrap(<RequestsDrawerTab onOpen={onOpen} />);

    const grabber = screen.getByRole('button', { name: 'Open requests' });
    expect(grabber).toHaveStyle({ position: 'fixed', bottom: '0px' });
    await user.click(grabber);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hides itself until the pointer comes near the bottom of the window', async () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      wrap(<RequestsDrawerTab onOpen={() => undefined} revealWithin={150} />);
      const grabber = screen.getByRole('button', { name: 'Open requests' });
      expect(grabber).toHaveStyle({ opacity: '0', pointerEvents: 'none' });

      window.dispatchEvent(
        new PointerEvent('pointermove', { clientY: window.innerHeight - 40, bubbles: true }),
      );
      await waitFor(() => expect(grabber).toHaveStyle({ opacity: '1' }));

      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 10, bubbles: true }));
      await waitFor(() => expect(grabber).toHaveStyle({ opacity: '0' }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('RequestsBoard', () => {
  it('always names the summary columns', () => {
    wrap(<RequestsBoard rows={[]} emptyText="No requests yet." />);
    REQUEST_COLUMN_HEADINGS.forEach((heading) => {
      expect(screen.getByText(heading)).toBeInTheDocument();
    });
    expect(screen.getByText('No requests yet.')).toBeInTheDocument();
    expect(screen.getByText('Pick a request to read it in full.')).toBeInTheDocument();
  });

  it('opens the first row in the detail pane and swaps it on click, without growing the list', async () => {
    const user = userEvent.setup({ delay: null });
    const rows = [
      request({ id: 1, body: 'Parts bin on the bench.' }),
      request({ id: 2, body: 'Scan beep on receive.', submitted_by_name: 'Ashley Proc', area: 'processing' }),
    ];
    wrap(<RequestsBoard rows={rows} emptyText="none" />);

    const listRows = screen.getAllByRole('button', { name: /Open request from/ });
    expect(listRows).toHaveLength(2);
    expect(listRows[0]).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('button', { name: 'Open request from Ashley Proc' }));
    expect(screen.getByRole('button', { name: 'Open request from Ashley Proc' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // The list still holds exactly two rows: detail replaced the pane, it did not expand a row.
    expect(screen.getAllByRole('button', { name: /Open request from/ })).toHaveLength(2);
  });

  it('keeps someone else\'s request read-only with the note field reserved', () => {
    wrap(<RequestsBoard rows={[request()]} emptyText="none" />);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Request')).not.toBeInTheDocument();
    const note = screen.getByLabelText('Notes are the owner’s to add');
    expect(note).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
    expect(screen.queryByText('THE REQUEST')).not.toBeInTheDocument();
    expect(screen.getByText('FROM')).toBeInTheDocument();
    expect(screen.getByText('STATUS')).toBeInTheDocument();
    expect(screen.getAllByText('PRIORITY').length).toBeGreaterThan(1);
  });

  it('lets the owner edit the body and add a note', async () => {
    const user = userEvent.setup({ delay: null });
    const onSave = vi.fn();
    const onNote = vi.fn();
    wrap(
      <RequestsBoard
        rows={[request({ can_edit: true, can_note: true })]}
        emptyText="none"
        onSave={onSave}
        onNote={onNote}
      />,
    );

    await user.type(screen.getByLabelText('Request'), ' Two of them.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(1, {
      area: 'restoration',
      body: 'Need a parts bin. Two of them.',
    });

    await user.type(screen.getByLabelText('Add a note'), 'By the hinge shelf.');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onNote).toHaveBeenCalledWith(1, 'By the hinge shelf.');
  });

  it('shows the triage controls only on the owner page', () => {
    const { unmount } = wrap(<RequestsBoard rows={[request()]} emptyText="none" />);
    expect(screen.queryByLabelText('Target date')).not.toBeInTheDocument();
    unmount();

    wrap(<RequestsBoard rows={[request()]} emptyText="none" triage />);
    expect(screen.getByLabelText('Target date')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });
});

describe('RequestsDrawer', () => {
  it('separates the new-request band from the list of past requests', async () => {
    const user = userEvent.setup({ delay: null });
    createMutate.mockReset();
    rowsState.rows = [
      request({ id: 1, body: 'Mine', can_edit: true, can_note: true }),
      request({ id: 2, body: 'Theirs', submitted_by_name: 'Ashley Proc' }),
    ];
    wrap(<RequestsDrawer open onClose={() => undefined} defaultArea="restoration" />);

    expect(screen.getByRole('button', { name: 'Close requests' })).toBeInTheDocument();
    expect(screen.queryByText('NEW REQUEST')).not.toBeInTheDocument();
    expect(screen.getByText('ALL REQUESTS · 2')).toBeInTheDocument();

    const compose = screen.getByLabelText('What do you want changed?');
    expect(screen.getByRole('button', { name: 'File' })).toBeDisabled();
    await user.type(compose, 'Bigger scan field.');
    await user.click(screen.getByRole('button', { name: 'File' }));
    expect(createMutate).toHaveBeenCalledWith(
      { area: 'restoration', body: 'Bigger scan field.' },
      expect.anything(),
    );
  });
});
