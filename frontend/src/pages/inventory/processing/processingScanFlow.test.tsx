/**
 * Dash Updates #97: the search is always in reach on Processing and a scan works right after Back to queue or a
 * check-in. One test group per point of the update.
 */
import { useState } from 'react';
import { Button, Dialog, TextField } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { ProcessingCheckInDialog } from './ProcessingCheckInDialog';
import { ProcessingScanBar } from './ProcessingScanBar';
import { isGuardedBox, useScanRouting } from './processingScanRouting';

vi.mock('../../../api/client', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() } }));

/** The page in small: one search (shared words), a price box, a quantity box and a button. */
function Page({ onSubmit = () => {}, onTakenOut }: { onSubmit?: () => void; onTakenOut?: (s: string) => void }) {
  const [search, setSearch] = useState('blender');
  const [price, setPrice] = useState('4.99');
  const [signal, setSignal] = useState(0);
  useScanRouting({ onScanTakenOut: onTakenOut });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <ProcessingScanBar search={search} onSearchChange={setSearch} searchFocusSignal={signal} autoFocusOnMount={false} />
      <TextField label="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
      <TextField label="UPC" defaultValue="" />
      <Button onClick={() => setSignal((n) => n + 1)}>Back to queue</Button>
      <Button>Some button</Button>
    </form>
  );
}

const searchBox = () => screen.getByRole('textbox', { name: 'Scan or search processing queue' }) as HTMLInputElement;

/** Wait out the frame the bar waits before taking the cursor. */
const nextFrame = () => act(() => new Promise<void>((r) => { window.setTimeout(r, 5); }));

afterEach(() => vi.restoreAllMocks());

describe('1. the search is on screen everywhere, the check-in window included', () => {
  it('the check-in window shows the same search at its top', () => {
    const row = {
      processing_row_id: 1, rowNum: 4, product: null, productLinks: [], dispatch: 'on_shelf', unitRetail: '20.00',
      price: '9.99', condition: 'good', manifestNotes: '', qtyExpected: 3, qtyRemaining: 3,
    } as unknown as ProcessingWorkspaceRowDTO;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProcessingCheckInDialog
          open
          row={row}
          loading={false}
          onClose={() => {}}
          onSubmit={async () => true}
          searchBar={<ProcessingScanBar search="" onSearchChange={() => {}} scope="dialog" mode="detail" autoFocusOnMount={false} ariaLabel="Check-in search" />}
        />
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog');
    const input = screen.getByRole('textbox', { name: 'Check-in search' });
    expect(dialog.contains(input)).toBe(true);
    expect(input).toHaveAttribute('data-scan-search', 'dialog');
  });
});

describe('2. Back to queue: the cursor is in the search with its words selected', () => {
  it('the old words are selected, so a scan replaces them', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Back to queue' }));
    await nextFrame();
    const input = searchBox();
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'blender'.length]);
    await user.keyboard('012345678905');
    expect(input.value).toBe('012345678905');
  });
});

describe('3. after a check-in: the cursor goes back to the search, words selected', () => {
  it('once the check-in window has closed, the search takes the cursor and selects its words', async () => {
    function AfterCheckIn() {
      const [open, setOpen] = useState(true);
      const [signal, setSignal] = useState(0);
      return (
        <>
          <ProcessingScanBar search="kettle" onSearchChange={() => {}} searchFocusSignal={signal} autoFocusOnMount={false} />
          <Dialog open={open} disableRestoreFocus>
            <Button onClick={() => { setOpen(false); setSignal((n) => n + 1); }}>Check in</Button>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<AfterCheckIn />);
    await user.click(screen.getByRole('button', { name: 'Check in' }));
    await nextFrame();
    // While the window fades out the page is still marked hidden, so find the search by its mark.
    const input = document.querySelector('input[data-scan-search="page"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'kettle'.length]);
  });
});

describe('4. a scan goes to the search, never into a price box', () => {
  it('a key typed on a button goes to the search and replaces its words', async () => {
    const user = userEvent.setup();
    render(<Page />);
    screen.getByRole('button', { name: 'Some button' }).focus();
    await user.keyboard('012345678905');
    expect(document.activeElement).toBe(searchBox());
    expect(searchBox().value).toBe('012345678905');
  });

  it('a scanner burst into the price box is taken back out, moved to the search, and its Enter is not a save', async () => {
    const submitted = vi.fn();
    const takenOut = vi.fn();
    const user = userEvent.setup();
    render(<Page onSubmit={submitted} onTakenOut={takenOut} />);
    const price = screen.getByLabelText('Price') as HTMLInputElement;
    await user.click(price);
    await user.keyboard('012345678905{Enter}');
    expect(price.value).toBe('4.99');
    expect(searchBox().value).toBe('012345678905');
    expect(document.activeElement).toBe(searchBox());
    expect(submitted).not.toHaveBeenCalled();
    expect(takenOut).toHaveBeenCalledWith('012345678905');
  });

  it('a person typing a price at a normal pace keeps it', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 150; return now; });
    const user = userEvent.setup();
    render(<Page />);
    const price = screen.getByLabelText('Price') as HTMLInputElement;
    await user.tripleClick(price);
    await user.keyboard('1234567{Enter}');
    expect(price.value).toBe('1234567');
    expect(searchBox().value).toBe('blender');
  });

  it('a UPC box takes a scan as it should; only money, counts and notes are guarded', () => {
    render(<Page />);
    expect(isGuardedBox(screen.getByLabelText('UPC'))).toBe(false);
    expect(isGuardedBox(screen.getByLabelText('Price'))).toBe(true);
    expect(isGuardedBox(searchBox())).toBe(false);
  });
});

describe('5. a scan that finds nothing says so in a fixed spot', () => {
  it('the spot is there with or without a message, so nothing moves', () => {
    const { rerender } = render(<ProcessingScanBar search="0123" onSearchChange={() => {}} autoFocusOnMount={false} />);
    const spot = screen.getByRole('status');
    expect(spot).toHaveTextContent('');
    rerender(
      <ProcessingScanBar
        search="0123"
        onSearchChange={() => {}}
        autoFocusOnMount={false}
        status={{ text: 'Nothing on this truck matches 0123.', tone: 'warning' }}
      />,
    );
    expect(screen.getByRole('status')).toBe(spot);
    expect(spot).toHaveTextContent('Nothing on this truck matches 0123.');
  });
});

describe('5. a scan that finds one row opens it', () => {
  it('rows checked in as one group count as one row and open on the main row', async () => {
    const { soleRowId } = await import('./processingScanRouting');
    expect(soleRowId([{ processing_row_id: 7 }])).toBe(7);
    expect(soleRowId([{ processing_row_id: 7 }, { processing_row_id: 9, collapseMasterId: 7 }])).toBe(7);
    expect(soleRowId([{ processing_row_id: 7 }, { processing_row_id: 8 }])).toBeNull();
    expect(soleRowId([])).toBeNull();
  });
});
