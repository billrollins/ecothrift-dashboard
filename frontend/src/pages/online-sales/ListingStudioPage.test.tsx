import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import ListingStudioPage from './ListingStudioPage';

const studioState = vi.hoisted(() => ({
  listing: null as null | Record<string, unknown>,
  isLoading: false,
  isError: false,
}));

vi.mock('../../hooks/useWebStore', () => ({
  useWebListing: () => ({
    data: studioState.listing,
    isLoading: studioState.isLoading,
    isError: studioState.isError,
  }),
  useCategoryOptions: () => ({ data: [] }),
  useUpdateWebListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadWebListingImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWebListingImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishWebListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePauseWebListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveWebListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestoreWebListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGenerateFbCopy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkFbPosted: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/online-sales/listings/7']}>
          <Routes>
            <Route path="/online-sales/listings/:id" element={<ListingStudioPage />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('ListingStudioPage', () => {
  beforeEach(() => {
    studioState.listing = null;
    studioState.isLoading = false;
    studioState.isError = false;
  });

  it('renders listing studio with linked item', () => {
    studioState.listing = {
      id: 7,
      title: 'Studio lamp',
      sku: 'SL-7',
      description: 'Nice lamp',
      condition: 'good',
      price: '35.00',
      compare_at_price: null,
      on_hand: 1,
      category: null,
      featured: false,
      return_policy: 'final_sale',
      fb_title: '',
      fb_body: '',
      fb_posted_url: '',
      status: 'draft',
      status_display: 'Draft',
      item_sku: 'ITEM-7',
      readiness_errors: ['Need at least one photo'],
      images: [],
    };
    wrap();
    expect(screen.getByText('Listing Studio')).toBeInTheDocument();
    expect(screen.getByText(/Linked item ITEM-7/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Studio lamp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('renders error when listing missing', () => {
    studioState.isError = true;
    wrap();
    expect(screen.getByText('Could not load this listing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to listings/i })).toBeInTheDocument();
  });

  it('renders unlinked listing without crashing', () => {
    studioState.listing = {
      id: 7,
      title: 'Manual listing',
      sku: '',
      description: '',
      condition: 'good',
      price: '10.00',
      compare_at_price: null,
      on_hand: 1,
      category: null,
      featured: false,
      return_policy: 'final_sale',
      fb_title: '',
      fb_body: '',
      fb_posted_url: '',
      status: 'draft',
      status_display: 'Draft',
      item_sku: null,
      readiness_errors: [],
      images: [],
    };
    wrap();
    expect(screen.getByText(/Manual \/ unlinked listing/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Manual listing')).toBeInTheDocument();
  });
});
