import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BadTag, BadTagListResponse } from '../../../api/badTags.api';
import TagErrorsPage from './TagErrorsPage';

const api = vi.hoisted(() => ({ listBadTags: vi.fn(), fetchBadTagPhoto: vi.fn() }));
vi.mock('../../../api/badTags.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/badTags.api')>()),
  ...api,
}));

const ROW: BadTag = {
  id: 1,
  code: 'ITM0000101',
  reason: 'retail_high',
  reason_label: 'Retail overstated',
  reason_label_es: 'Precio de lista inflado',
  where: 'section_check',
  where_label: 'Section check',
  detail: 'Says $400 retail',
  right_price: null,
  right_retail: '60.00',
  photo_url: '/api/stocktake/bad-tags/1/photo/',
  found_by: 'Sam',
  found_at: '2026-10-21T14:14:00-05:00',
  tag_price: '14.00',
  tag_retail: '400.00',
  retail_check: '',
  item: {
    id: 101, sku: 'ITM0000101', title: 'Brass lamp', brand: 'Pottery Barn', product_number: '',
    price: '14.00', retail: '400.00', status: 'on_shelf', location: 'Aisle 3',
  },
  trace: {
    checked_in_by: 'Maria',
    checked_in_by_id: 4,
    checked_in_at: '2026-10-20T10:00:00-05:00',
    purchase_order_id: 12,
    order_number: 'PO-1234',
    manifest_row_id: 99,
    manifest_row_number: 56,
    pallet: { id: 3, number: 3, code: 'P3' },
  },
  issue_id: 7,
  fixed_at: null,
  fixed_by: '',
  fix: '',
};

function page(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[url]}>
          <TagErrorsPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('TagErrorsPage', () => {
  beforeEach(() => {
    api.listBadTags.mockReset();
  });

  it('shows a non-manager their own tags as cards, with the trace and the right retail', async () => {
    api.listBadTags.mockResolvedValue({ reasons: [], manager: false, rows: [ROW] } satisfies BadTagListResponse);
    page('/inventory/tag-errors?week=2026-W43');
    expect(await screen.findByText('Brass lamp')).toBeInTheDocument();
    expect(screen.getByText('Tags you checked in or found.')).toBeInTheDocument();
    expect(screen.getByText('PO-1234 · row 56 · pallet 3')).toBeInTheDocument();
    expect(screen.getByText('$14.00 · retail $400.00')).toBeInTheDocument();
    expect(screen.getByText('retail $60.00')).toBeInTheDocument();
    expect(screen.getByText('1 tag error · 1 open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Photo/ })).toBeInTheDocument();
    expect(api.listBadTags).toHaveBeenCalledWith({ week: '2026-W43' });
  });

  it('passes a manager link from Retail QA through as filters', async () => {
    api.listBadTags.mockResolvedValue({ reasons: [], manager: true, rows: [ROW] } satisfies BadTagListResponse);
    page('/inventory/tag-errors?week=2026-W43&processor=4&show=open');
    expect(await screen.findByText('Checked in by Maria')).toBeInTheDocument();
    expect(api.listBadTags).toHaveBeenCalledWith({ week: '2026-W43', show: 'open', processor: 4 });
  });

  it('says so when the week is clean', async () => {
    api.listBadTags.mockResolvedValue({ reasons: [], manager: true, rows: [] } satisfies BadTagListResponse);
    page('/inventory/tag-errors?week=2026-W40');
    expect(await screen.findByText('No tag errors this week.')).toBeInTheDocument();
  });
});
