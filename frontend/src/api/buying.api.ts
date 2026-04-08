import type { PaginatedResponse } from '../types/index';
import type {
  BuyingAuctionDetail,
  BuyingAuctionListItem,
  BuyingAuctionListParams,
  BuyingAuctionSnapshot,
  BuyingAuctionSummaryParams,
  BuyingAuctionSummaryResponse,
  BuyingManifestRow,
  BuyingMarketplace,
  BuyingPollResponse,
  BuyingPullManifestResponse,
  BuyingSweepResponse,
  BuyingWatchlistAuctionItem,
  BuyingWatchlistEntry,
  BuyingWatchlistParams,
  BuyingWatchlistPostBody,
} from '../types/buying.types';
import api from './client';

export type {
  BuyingAuctionDetail,
  BuyingAuctionListItem,
  BuyingAuctionSnapshot,
  BuyingManifestRow,
  BuyingMarketplace,
  BuyingPollResponse,
  BuyingPullManifestResponse,
  BuyingSweepResponse,
  BuyingWatchlistAuctionItem,
  BuyingWatchlistEntry,
};

function buildAuctionParams(params: BuyingAuctionListParams): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  if (params.ordering) q.ordering = params.ordering;
  if (params.marketplace) q.marketplace = params.marketplace;
  if (params.status) q.status = params.status;
  if (params.has_manifest !== undefined && params.has_manifest !== null) {
    q.has_manifest = params.has_manifest;
  }
  return q;
}

function buildSummaryParams(params: BuyingAuctionSummaryParams): Record<string, string | boolean> {
  const q: Record<string, string | boolean> = {};
  if (params.marketplace) q.marketplace = params.marketplace;
  if (params.status) q.status = params.status;
  if (params.has_manifest !== undefined && params.has_manifest !== null) {
    q.has_manifest = params.has_manifest;
  }
  return q;
}

function buildWatchlistParams(params: BuyingWatchlistParams): Record<string, string | number> {
  const q: Record<string, string | number> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  if (params.ordering) q.ordering = params.ordering;
  if (params.priority) q.priority = params.priority;
  if (params.watchlist_status) q.watchlist_status = params.watchlist_status;
  return q;
}

export async function fetchBuyingAuctions(
  params: BuyingAuctionListParams = {}
): Promise<PaginatedResponse<BuyingAuctionListItem>> {
  const { data } = await api.get<PaginatedResponse<BuyingAuctionListItem>>('/buying/auctions/', {
    params: buildAuctionParams(params),
  });
  return data;
}

export async function fetchBuyingWatchlist(
  params: BuyingWatchlistParams = {}
): Promise<PaginatedResponse<BuyingWatchlistAuctionItem>> {
  const { data } = await api.get<PaginatedResponse<BuyingWatchlistAuctionItem>>('/buying/watchlist/', {
    params: buildWatchlistParams(params),
  });
  return data;
}

export async function fetchBuyingAuctionSummary(
  params: BuyingAuctionSummaryParams = {}
): Promise<BuyingAuctionSummaryResponse> {
  const { data } = await api.get<BuyingAuctionSummaryResponse>('/buying/auctions/summary/', {
    params: buildSummaryParams(params),
  });
  return data;
}

export async function fetchBuyingAuction(id: number): Promise<BuyingAuctionDetail> {
  const { data } = await api.get<BuyingAuctionDetail>(`/buying/auctions/${id}/`);
  return data;
}

export async function fetchBuyingManifestRows(
  auctionId: number,
  params: { page?: number } = {}
): Promise<PaginatedResponse<BuyingManifestRow>> {
  const { data } = await api.get<PaginatedResponse<BuyingManifestRow>>(
    `/buying/auctions/${auctionId}/manifest_rows/`,
    {
      params: params.page != null ? { page: params.page } : {},
    }
  );
  return data;
}

export async function postBuyingPullManifest(auctionId: number): Promise<BuyingPullManifestResponse> {
  const { data } = await api.post<BuyingPullManifestResponse>(
    `/buying/auctions/${auctionId}/pull_manifest/`
  );
  return data;
}

export async function fetchBuyingSnapshots(
  auctionId: number
): Promise<PaginatedResponse<BuyingAuctionSnapshot>> {
  const { data } = await api.get<PaginatedResponse<BuyingAuctionSnapshot>>(
    `/buying/auctions/${auctionId}/snapshots/`,
    { params: { page: 1 } }
  );
  return data;
}

export async function postBuyingPoll(auctionId: number): Promise<BuyingPollResponse> {
  const { data } = await api.post<BuyingPollResponse>(`/buying/auctions/${auctionId}/poll/`);
  return data;
}

export async function postBuyingWatchlist(
  auctionId: number,
  body?: BuyingWatchlistPostBody
): Promise<BuyingWatchlistEntry> {
  const { data } = await api.post<BuyingWatchlistEntry>(
    `/buying/auctions/${auctionId}/watchlist/`,
    body ?? {}
  );
  return data;
}

export async function deleteBuyingWatchlist(auctionId: number): Promise<void> {
  await api.delete(`/buying/auctions/${auctionId}/watchlist/`);
}

export async function fetchBuyingMarketplaces(): Promise<BuyingMarketplace[]> {
  const { data } = await api.get<PaginatedResponse<BuyingMarketplace> | BuyingMarketplace[]>(
    '/buying/marketplaces/'
  );
  if (Array.isArray(data)) return data;
  return data.results;
}

/**
 * Triggers discovery (search API). Does not require B-Stock JWT on the server
 * when enrich_detail is false.
 */
export async function postBuyingSweep(marketplaceSlug?: string | null): Promise<BuyingSweepResponse> {
  const { data } = await api.post<BuyingSweepResponse>('/buying/sweep/', null, {
    params: marketplaceSlug ? { marketplace: marketplaceSlug } : {},
  });
  return data;
}
