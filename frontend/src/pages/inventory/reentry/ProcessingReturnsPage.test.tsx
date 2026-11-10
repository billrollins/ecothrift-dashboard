import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReentryList, ReentryRow } from '../../../api/reentry.api';
import ProcessingReturnsPage from './ProcessingReturnsPage';

const api = vi.hoisted(() => ({ listReentries: vi.fn(), reportReentry: vi.fn() }));
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
  });

  it('shows the steps and asks for the returns list', async () => {
    api.listReentries.mockResolvedValue(list([]));
    page();
    expect(screen.getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
    expect(screen.getByText('Pick one: Price again, Back to shelf as is, Send to Restoration, or Scrap.')).toBeInTheDocument();
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
    expect(screen.getByText('Is ITM0000031 a return in your hand? Add it here.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Why it came back (optional)'), 'Box was open');
    await user.click(screen.getByRole('button', { name: 'Add to Returns' }));
    await waitFor(() => expect(api.reportReentry).toHaveBeenCalledWith('ITM0000031', 'return', 'Box was open'));
    expect(await screen.findByTestId('reentry-row-7')).toBeInTheDocument();
  });

  it('says so when the item is waiting on Floor issues instead', async () => {
    const user = userEvent.setup();
    api.listReentries.mockResolvedValue(list([]));
    api.reportReentry.mockResolvedValue({ ...ROW, source: 'floor' });
    page();
    await screen.findByText('No returns are waiting.');
    await user.type(screen.getByLabelText('Find on Returns'), 'ITM0000031');
    await user.click(screen.getByRole('button', { name: 'Add to Returns' }));
    expect(await screen.findByText('This one is waiting on Floor issues.')).toBeInTheDocument();
  });
});
