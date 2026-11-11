import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReentryList, ReentryRow } from '../../../api/reentry.api';
import ProcessingReturnsPage from './ProcessingReturnsPage';

const api = vi.hoisted(() => ({ listReentries: vi.fn(), reportReentry: vi.fn(), findReentry: vi.fn() }));
vi.mock('../../../api/reentry.api', () => api);
vi.mock('./printReentryTag', () => ({ printReentryTag: vi.fn() }));
vi.mock('../../../components/objects/ObjectModal', () => ({
  ObjectLink: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('../restorationRequest/RestorationRequestDialog', () => ({ RestorationRequestDialog: () => null }));

const ROW: ReentryRow = {
  id: 7, source: 'return', source_label: 'Customer return', reason: 'Box was open', reported_by: 'Pat Processor',
  reported_at: '2026-11-10T15:00:00-06:00',
  item: { id: 31, sku: 'ITM0000031', price: '25.00', product_title: 'Desk fan', product_brand: '', product_number: '', tag_retail: null },
  sale: null, outcome: '', outcome_label: '', outcome_note: '', old_price: null, new_price: null, restoration_job: null,
  decided_by: '', decided_at: null,
};

function list(results: ReentryRow[]): ReentryList {
  return { source: 'return', done: false, waiting: { return: results.length, floor: 0 }, results };
}

function page() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/inventory/returns']}>
        <ProcessingReturnsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProcessingReturnsPage', () => {
  beforeEach(() => {
    api.listReentries.mockReset();
    api.reportReentry.mockReset();
    api.findReentry.mockReset();
    api.findReentry.mockResolvedValue({ item: { ...ROW.item, status_label: 'On shelf' }, row: null, last: null });
  });

  it('shows the steps and asks for the returns list', async () => {
    api.listReentries.mockResolvedValue(list([]));
    page();
    expect(screen.getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
    expect(screen.getByText('Tap one of its four buttons. The line under the find box says where the item goes. A slip? Back to shelf as is and Scrap give you a few seconds to undo.')).toBeInTheDocument();
    // What each button is for, and where the item goes after.
    expect(screen.getAllByText(/It can sell, at a new price\. A new tag prints\. Back to the sales floor\./).length).toBeGreaterThan(0);
    expect(await screen.findByText('No returns are waiting.')).toBeInTheDocument();
    expect(api.listReentries).toHaveBeenCalledWith('return', false);
  });

  it('adds an item in hand that is not on the list, with why it came back', async () => {
    const user = userEvent.setup();
    api.listReentries.mockResolvedValueOnce(list([])).mockResolvedValue(list([ROW]));
    api.reportReentry.mockResolvedValue(ROW);
    page();
    await screen.findByText('No returns are waiting.');
    await user.type(screen.getByLabelText('Find on Returns'), 'https://ecothrift.us/i/itm0000031');
    // The item is looked up first, so the person sees what they are about to add.
    expect(await screen.findByText('Desk fan (ITM0000031)')).toBeInTheDocument();
    expect(screen.getByText('Did a customer bring it back? Add it to Returns.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Why it came back (optional)'), 'Box was open');
    await user.click(screen.getByRole('button', { name: 'Add to Returns' }));
    await waitFor(() => expect(api.reportReentry).toHaveBeenCalledWith('ITM0000031', 'return', 'Box was open'));
    expect(await screen.findByTestId('reentry-row-7')).toBeInTheDocument();
    expect(screen.getByText('Desk fan (ITM0000031) is on Returns now. Pick what happens to it.')).toBeInTheDocument();

  });

  it('says so when the item is waiting on Floor issues instead', async () => {
    const user = userEvent.setup();
    api.listReentries.mockResolvedValue(list([]));
    api.reportReentry.mockResolvedValue({ ...ROW, source: 'floor' });
    page();
    await screen.findByText('No returns are waiting.');
    await user.type(screen.getByLabelText('Find on Returns'), 'ITM0000031');
    await user.click(await screen.findByRole('button', { name: 'Add to Returns' }));
    expect(await screen.findByText('Desk fan (ITM0000031) is waiting on Floor issues.')).toBeInTheDocument();
  });

  it('does not offer to add a number that is no item', async () => {
    const user = userEvent.setup();
    api.listReentries.mockResolvedValue(list([]));
    api.findReentry.mockRejectedValue(new Error('No item with that number.'));
    page();
    await screen.findByText('No returns are waiting.');
    // Plain words are a search, not a tag: nothing is looked up or offered.
    await user.type(screen.getByLabelText('Find on Returns'), 'zzqqxx');
    expect(await screen.findByText('To look an item up, scan its tag or type its whole item number.')).toBeInTheDocument();
    expect(api.findReentry).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Find on Returns'));
    await user.type(screen.getByLabelText('Find on Returns'), 'ITM9999999');
    expect(await screen.findByText('No item has the number ITM9999999.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Returns' })).not.toBeInTheDocument();
  });
});
