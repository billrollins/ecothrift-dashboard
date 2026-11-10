import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReentryDone, ReentryList as ReentryListData, ReentryRow } from '../../../api/reentry.api';
import { ReentryList } from './ReentryList';
import { filterRows, outcomeLine, typedPrice } from './reentry';

const api = vi.hoisted(() => ({
  listReentries: vi.fn(),
  reentryPriceAgain: vi.fn(),
  reentryBackToShelf: vi.fn(),
  reentrySendToRestoration: vi.fn(),
  reentryScrap: vi.fn(),
}));
vi.mock('../../../api/reentry.api', () => api);
const printing = vi.hoisted(() => ({ printReentryTag: vi.fn() }));
vi.mock('./printReentryTag', () => printing);
vi.mock('../../../components/objects/ObjectModal', () => ({
  ObjectLink: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('../restorationRequest/RestorationRequestDialog', () => ({
  RestorationRequestDialog: ({ open, onConfirm }: { open: boolean; onConfirm: (r: unknown) => void }) =>
    open ? <button type="button" onClick={() => onConfirm({ needs: ['repair'], done_price: '60.00' })}>Confirm request</button> : null,
}));

const LAMP: ReentryRow = {
  id: 1, source: 'return', source_label: 'Customer return', reason: 'Late return: Store was closed.',
  reported_by: 'Sam Clerk', reported_at: '2026-11-10T15:00:00-06:00',
  item: {
    id: 11, sku: 'ITM0000011', price: '80.00', product_title: 'Brass lamp', product_brand: 'Pottery Barn',
    product_number: '', tag_retail: '200.00', retail: '200.00', status: 'sold', status_label: 'Sold',
  },
  sale: { sold_at: '2026-11-09T12:00:00-06:00', sold_price: '80.00', receipt_number: 'R-1001', cart: 55 },
  outcome: '', outcome_label: '', outcome_note: '', old_price: null, new_price: null, restoration_job: null,
  decided_by: '', decided_at: null,
};
const VASE: ReentryRow = {
  ...LAMP, id: 2, reason: '', sale: null,
  item: { ...LAMP.item, id: 12, sku: 'ITM0000012', product_title: 'Glass vase', product_brand: '', price: '50.00', retail: null },
};

function listOf(results: ReentryRow[], done = false): ReentryListData {
  return { source: 'return', done, waiting: { return: results.filter((r) => !r.outcome).length, floor: 4 }, results };
}

function closed(row: ReentryRow, patch: Partial<ReentryRow>, item: Partial<ReentryRow['item']> = {}): ReentryDone {
  return { row: { ...row, decided_by: 'Pat Processor', decided_at: '2026-11-10T16:00:00-06:00', ...patch }, item: { ...row.item, ...item } };
}

function show(source: 'return' | 'floor' = 'return') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReentryList source={source} notOnList={(typed) => <span>{`Add ${typed}`}</span>} />
    </QueryClientProvider>,
  );
}

describe('ReentryList', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    printing.printReentryTag.mockReset();
    api.listReentries.mockImplementation(async (_source: string, done: boolean) => (done ? listOf([], true) : listOf([LAMP, VASE])));
  });

  it('lists what is waiting for its source, with why it came back and the four actions', async () => {
    show();
    const lamp = within(await screen.findByTestId('reentry-row-1'));
    expect(api.listReentries).toHaveBeenCalledWith('return', false);
    expect(lamp.getByText('Brass lamp')).toBeInTheDocument();
    expect(lamp.getByText(/Pottery Barn · Tag \$80\.00 · Retail \$200\.00/)).toBeInTheDocument();
    expect(lamp.getByText(/Returned Tue Nov 10 by Sam Clerk · Sold for \$80\.00 on Mon Nov 9/)).toBeInTheDocument();
    expect(lamp.getByText('Why: Late return: Store was closed.')).toBeInTheDocument();
    for (const name of ['Price again', 'Back to shelf as is', 'Send to Restoration', 'Scrap']) {
      expect(lamp.getByRole('button', { name: `${name}: Brass lamp` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Waiting (2)' })).toBeInTheDocument();
  });

  it('the floor page asks for its own rows and uses its own words', async () => {
    api.listReentries.mockResolvedValue({ ...listOf([]), source: 'floor' });
    show('floor');
    expect(await screen.findByText('No floor issues are waiting.')).toBeInTheDocument();
    expect(api.listReentries).toHaveBeenCalledWith('floor', false);
  });

  it('Price again saves the new price, prints the tag and says what happened', async () => {
    const user = userEvent.setup();
    const done = closed(LAMP, { outcome: 'repriced', old_price: '80.00', new_price: '59.99' }, { price: '59.99' });
    api.reentryPriceAgain.mockResolvedValue(done);
    printing.printReentryTag.mockResolvedValue(true);
    show();
    await user.click(await screen.findByRole('button', { name: 'Price again: Brass lamp' }));
    const save = screen.getByRole('button', { name: 'Save and print tag' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('New price for Brass lamp'), '59.99');
    await user.click(save);
    await waitFor(() => expect(api.reentryPriceAgain).toHaveBeenCalledWith(1, '59.99'));
    expect(await screen.findByText(/Brass lamp \(ITM0000011\): Priced again: \$80\.00 to \$59\.99\. Tag printed\./)).toBeInTheDocument();
    expect(printing.printReentryTag).toHaveBeenCalledWith(done.item);
    expect(api.listReentries.mock.calls.length).toBeGreaterThan(1); // the list was read again
  });

  it('a tag that did not print can be printed again', async () => {
    const user = userEvent.setup();
    api.reentryPriceAgain.mockResolvedValue(closed(LAMP, { outcome: 'repriced', old_price: '80.00', new_price: '70.00' }));
    printing.printReentryTag.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    show();
    await user.click(await screen.findByRole('button', { name: 'Price again: Brass lamp' }));
    await user.type(screen.getByLabelText('New price for Brass lamp'), '70');
    await user.click(screen.getByRole('button', { name: 'Save and print tag' }));
    expect(await screen.findByText(/The tag did not print\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print tag again' }));
    expect(await screen.findByText(/Tag printed\./)).toBeInTheDocument();
  });

  it('Back to shelf as is takes one tap and prints nothing', async () => {
    const user = userEvent.setup();
    api.reentryBackToShelf.mockResolvedValue(closed(VASE, { outcome: 'shelf' }));
    show();
    await user.click(await screen.findByRole('button', { name: 'Back to shelf as is: Glass vase' }));
    expect(await screen.findByText('Glass vase (ITM0000012): Back to shelf as is.')).toBeInTheDocument();
    expect(api.reentryBackToShelf).toHaveBeenCalledWith(2);
    expect(printing.printReentryTag).not.toHaveBeenCalled();
  });

  it('Scrap needs a reason, and a quick reason is one tap', async () => {
    const user = userEvent.setup();
    api.reentryScrap.mockResolvedValue(closed(VASE, { outcome: 'scrapped', outcome_note: 'Broken' }));
    show();
    await user.click(await screen.findByRole('button', { name: 'Scrap: Glass vase' }));
    const scrapIt = screen.getByRole('button', { name: 'Scrap it' });
    expect(scrapIt).toBeDisabled();
    await user.click(screen.getByText('Broken'));
    await user.click(scrapIt);
    await waitFor(() => expect(api.reentryScrap).toHaveBeenCalledWith(2, 'Broken'));
    expect(await screen.findByText('Glass vase (ITM0000012): Scrapped: Broken.')).toBeInTheDocument();
  });

  it('Send to Restoration uses the usual request and prints the restoration tag', async () => {
    const user = userEvent.setup();
    const tag = { needs: ['Repair'], holdout: false, sent_on: '2026-11-10', sent_by: 'Pat' };
    const done = closed(LAMP, { outcome: 'restoration', restoration_job: 9 }, { restoration_tag: tag });
    api.reentrySendToRestoration.mockResolvedValue(done);
    printing.printReentryTag.mockResolvedValue(true);
    show();
    await user.click(await screen.findByRole('button', { name: 'Send to Restoration: Brass lamp' }));
    await user.click(screen.getByRole('button', { name: 'Confirm request' }));
    await waitFor(() => expect(api.reentrySendToRestoration).toHaveBeenCalledWith(1, { needs: ['repair'], done_price: '60.00' }));
    expect(await screen.findByText(/Sent to Restoration\. Tag printed\./)).toBeInTheDocument();
    expect(printing.printReentryTag).toHaveBeenCalledWith(done.item);
  });

  it("shows the server's words when an action is refused, and the item stays", async () => {
    const user = userEvent.setup();
    api.reentryBackToShelf.mockRejectedValue(new Error('Someone already handled this one.'));
    show();
    await user.click(await screen.findByRole('button', { name: 'Back to shelf as is: Brass lamp' }));
    expect(await screen.findByText('Someone already handled this one.')).toBeInTheDocument();
    expect(screen.getByTestId('reentry-row-1')).toBeInTheDocument();
  });

  it('a scan narrows the list, and one that is not on it gets the page\'s own answer', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByTestId('reentry-row-1');
    const find = screen.getByLabelText('Find on Returns');
    await user.type(find, 'HTTPS://ECOTHRIFT.US/I/ITM0000012');
    expect(screen.queryByTestId('reentry-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('reentry-row-2')).toBeInTheDocument();
    await user.clear(find);
    await user.type(find, 'ITM9999999');
    expect(screen.getByText('Nothing waiting on Returns matches that.')).toBeInTheDocument();
    expect(screen.getByText('Add ITM9999999')).toBeInTheDocument();
  });

  it('Done shows what happened to each one, who and when', async () => {
    const user = userEvent.setup();
    const done = closed(LAMP, { outcome: 'scrapped', outcome_note: 'Shade is shattered' }).row;
    api.listReentries.mockImplementation(async (_s: string, isDone: boolean) => (isDone ? listOf([done], true) : listOf([VASE])));
    show();
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    const row = within(await screen.findByTestId('reentry-row-1'));
    expect(row.getByText('Scrapped: Shade is shattered')).toBeInTheDocument();
    expect(row.getByText('Pat Processor · Tue Nov 10')).toBeInTheDocument();
    expect(row.queryByRole('button', { name: /Price again/ })).not.toBeInTheDocument();
  });
});

describe('reentry words', () => {
  it('reads a typed price', () => {
    expect(typedPrice(' $1,059.5 ')).toBe('1059.50');
    expect(typedPrice('59.99')).toBe('59.99');
    for (const bad of ['', '0', 'lots', '-5', '5.999']) expect(typedPrice(bad)).toBeNull();
  });

  it('finds by item number first, then by words', () => {
    expect(filterRows([LAMP, VASE], 'itm0000011')).toEqual([LAMP]);
    expect(filterRows([LAMP, VASE], 'vase')).toEqual([VASE]);
    expect(filterRows([LAMP, VASE], '  ')).toEqual([LAMP, VASE]);
  });

  it('says what was done', () => {
    expect(outcomeLine({ ...LAMP, outcome: 'repriced', old_price: '80.00', new_price: '80.00' })).toBe('Priced again at $80.00');
    expect(outcomeLine({ ...LAMP, outcome: 'handled', outcome_note: 'Sold again at the register.' })).toBe('Sold again at the register.');
  });
});
