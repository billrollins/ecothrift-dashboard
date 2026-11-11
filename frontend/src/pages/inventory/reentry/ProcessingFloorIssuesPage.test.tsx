import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReentryList as ReentryListData, ReentryRow } from '../../../api/reentry.api';
import ProcessingFloorIssuesPage from './ProcessingFloorIssuesPage';

const api = vi.hoisted(() => ({
  listReentries: vi.fn(),
  findReentry: vi.fn(),
  reentryPriceAgain: vi.fn(),
  reentryBackToShelf: vi.fn(),
  reentrySendToRestoration: vi.fn(),
  reentryScrap: vi.fn(),
}));
vi.mock('../../../api/reentry.api', () => api);
const floor = vi.hoisted(() => ({ listWaitingFloorIssues: vi.fn() }));
vi.mock('../../../api/floorIssues.api', () => floor);
vi.mock('./printReentryTag', () => ({ printReentryTag: vi.fn() }));
vi.mock('../../../components/objects/ObjectModal', () => ({
  ObjectLink: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('../restorationRequest/RestorationRequestDialog', () => ({ RestorationRequestDialog: () => null }));
vi.mock('./ReportPhoto', () => ({
  ReportPhoto: ({ url }: { url: string }) => <button type="button">{`Photo ${url}`}</button>,
}));
vi.mock('../../../components/badTags/BadTagButton', () => ({
  default: ({ code }: { code?: string }) => <button type="button">{code ? `Report a problem ${code}` : 'Report a problem'}</button>,
}));

const LAMP: ReentryRow = {
  id: 1, source: 'floor', source_label: 'Floor issue', reason: 'Broken or damaged: Cracked base',
  reported_by: 'Pat', reported_at: '2026-11-10T15:00:00-06:00',
  item: {
    id: 11, sku: 'ITM0000011', price: '24.00', product_title: 'Brass lamp', product_brand: 'Acme',
    product_number: '', tag_retail: null, retail: '80.00', status: 'processing', status_label: 'Processing',
  },
  sale: null, outcome: '', outcome_label: '', outcome_note: '', old_price: null, new_price: null,
  restoration_job: null, decided_by: '', decided_at: null,
};
const VASE: ReentryRow = {
  ...LAMP, id: 2, reason: 'Price too high: should be $6.00',
  item: { ...LAMP.item, id: 12, sku: 'ITM0000012', product_title: 'Glass vase', product_brand: '' },
};

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ProcessingFloorIssuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Processing > Floor issues', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    const list: ReentryListData = { source: 'floor', done: false, waiting: { return: 0, floor: 2 }, results: [LAMP, VASE] };
    api.listReentries.mockResolvedValue(list);
    floor.listWaitingFloorIssues.mockResolvedValue([
      { id: 7, reentry_id: 1, photo_url: '/api/inventory/floor-issues/7/photo/' },
      { id: 8, reentry_id: 2, photo_url: null },
    ]);
  });

  it('shows the floor rows with why, the four actions, and the photo where there is one', async () => {
    show();
    const lamp = within(await screen.findByTestId('reentry-row-1'));
    expect(api.listReentries).toHaveBeenCalledWith('floor', false);
    expect(screen.getByRole('heading', { name: 'Floor issues' })).toBeInTheDocument();
    expect(lamp.getByText('Why: Broken or damaged: Cracked base')).toBeInTheDocument();
    expect(lamp.getByText(/Reported .* by Pat/)).toBeInTheDocument();
    for (const action of ['Price again', 'Back to shelf as is', 'Send to Restoration', 'Scrap']) {
      expect(lamp.getByRole('button', { name: new RegExp(`^${action}: `) })).toBeInTheDocument();
    }
    expect(await lamp.findByRole('button', { name: 'Photo /api/inventory/floor-issues/7/photo/' })).toBeInTheDocument();
    const vase = within(screen.getByTestId('reentry-row-2'));
    expect(vase.getByText('Why: Price too high: should be $6.00')).toBeInTheDocument();
    expect(vase.queryByRole('button', { name: /^Photo/ })).not.toBeInTheDocument();
  });

  it('has the one report button, and offers it for an item in hand that is not on the list', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByTestId('reentry-row-1');
    expect(screen.getByRole('button', { name: 'Report a problem' })).toBeInTheDocument();

    api.findReentry.mockResolvedValue({ item: { ...LAMP.item, id: 99, sku: 'ITM0000099', product_title: 'Oak stool', status_label: 'On shelf' }, row: null, last: null });
    await user.type(screen.getByLabelText('Find on Floor issues'), 'ITM0000099');
    expect(await screen.findByText('Oak stool (ITM0000099)')).toBeInTheDocument();
    expect(screen.getByText('Does it have a problem? Report it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report a problem ITM0000099' })).toBeInTheDocument();
  });
});
