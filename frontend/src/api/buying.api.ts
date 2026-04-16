import type { PaginatedResponse } from '../types/index';
import type {
  BuyingAuctionDetail,
  BuyingAuctionListItem,
  BuyingAuctionListParams,
  BuyingAuctionSnapshot,
  BuyingAuctionSummaryParams,
  BuyingAuctionSummaryResponse,
  BuyingBudgetPullManifestBody,
  BuyingBudgetPullManifestResponse,
  BuyingCategoryNeedResponse,
  BuyingManifestRow,
  BuyingManifestRowsParams,
  BuyingMapFastCatBatchResponse,
  BuyingMarketplace,
  BuyingPollResponse,
  BuyingPullManifestResponse,
  BuyingUploadManifestResponse,
  BuyingSweepResponse,
  BuyingBstockTokenStatus,
  BuyingManifestQueueItem,
  BuyingManifestQueueParams,
  BuyingManifestPullLogEntry,
  BuyingManifestPullLogParams,
  BuyingValuationInputsPatch,
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
  BuyingMapFastCatBatchResponse,
  BuyingMarketplace,
  BuyingPollResponse,
  BuyingPullManifestResponse,
  BuyingUploadManifestResponse,
  BuyingSweepResponse,
  BuyingWatchlistAuctionItem,
  BuyingWatchlistEntry,
};

/** Stable React Query key: primitives only (avoid object identity churn). */
export function buyingAuctionListQueryKey(params: BuyingAuctionListParams) {
  return [
    'buying',
    'auctions',
    params.page ?? 1,
    params.page_size ?? 50,
    params.ordering ?? '',
    params.marketplace ?? '',
    params.status ?? '',
    params.has_manifest === true ? 't' : params.has_manifest === false ? 'f' : '',
    params.thumbs_up === true ? '1' : '',
    params.profitable === true ? '1' : '',
    params.needed === true ? '1' : '',
    params.q?.trim() ?? '',
    params.completed === true ? '1' : '',
    params.archived === true ? '1' : '',
  ] as const;
}

export function buyingWatchlistQueryKey(params: BuyingWatchlistParams) {
  return [
    'buying',
    'watchlist',
    params.page ?? 1,
    params.page_size ?? 50,
    params.ordering ?? '',
    params.marketplace ?? '',
    params.status ?? '',
    params.has_manifest === true ? 't' : params.has_manifest === false ? 'f' : '',
    params.priority ?? '',
    params.watchlist_status ?? '',
    params.thumbs_up === true ? '1' : '',
    params.profitable === true ? '1' : '',
    params.needed === true ? '1' : '',
    params.q?.trim() ?? '',
    params.completed === true ? '1' : '',
    params.archived === true ? '1' : '',
  ] as const;
}

function buildAuctionParams(params: BuyingAuctionListParams): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  if (params.ordering) q.ordering = params.ordering;
  if (params.marketplace) q.marketplace = params.marketplace;
  if (params.status) q.status = params.status;
  if (params.has_manifest === true) {
    q.has_manifest = 'true';
  } else if (params.has_manifest === false) {
    q.has_manifest = 'false';
  }
  if (params.thumbs_up === true) q.thumbs_up = true;
  if (params.profitable === true) q.profitable = true;
  if (params.needed === true) q.needed = true;
  const qq = params.q?.trim();
  if (qq) q.q = qq;
  if (params.completed === true) q.completed = true;
  if (params.archived === true) q.archived = true;
  return q;
}

function buildSummaryParams(params: BuyingAuctionSummaryParams): Record<string, string | boolean> {
  const q: Record<string, string | boolean> = {};
  if (params.marketplace) q.marketplace = params.marketplace;
  if (params.status) q.status = params.status;
  if (params.has_manifest === true) {
    q.has_manifest = 'true';
  } else if (params.has_manifest === false) {
    q.has_manifest = 'false';
  }
  if (params.completed === true) q.completed = true;
  if (params.archived === true) q.archived = true;
  return q;
}

function buildWatchlistParams(params: BuyingWatchlistParams): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  if (params.ordering) q.ordering = params.ordering;
  if (params.priority) q.priority = params.priority;
  if (params.watchlist_status) q.watchlist_status = params.watchlist_status;
  if (params.marketplace) q.marketplace = params.marketplace;
  if (params.status) q.status = params.status;
  if (params.has_manifest === true) {
    q.has_manifest = 'true';
  } else if (params.has_manifest === false) {
    q.has_manifest = 'false';
  }
  if (params.thumbs_up === true) q.thumbs_up = true;
  if (params.profitable === true) q.profitable = true;
  if (params.needed === true) q.needed = true;
  const wq = params.q?.trim();
  if (wq) q.q = wq;
  if (params.completed === true) q.completed = true;
  if (params.archived === true) q.archived = true;
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

/** Admin: next auctions in the nightly manifest pull queue. */
export async function fetchBuyingManifestQueue(
  params: BuyingManifestQueueParams = {}
): Promise<PaginatedResponse<BuyingManifestQueueItem>> {
  const q: Record<string, number> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  const { data } = await api.get<PaginatedResponse<BuyingManifestQueueItem>>(
    '/buying/auctions/manifest_queue/',
    { params: q }
  );
  return data;
}

/** Admin: recent manifest API pull audit rows. */
export async function fetchBuyingManifestPullLog(
  params: BuyingManifestPullLogParams = {}
): Promise<PaginatedResponse<BuyingManifestPullLogEntry>> {
  const q: Record<string, number> = {};
  if (params.page != null) q.page = params.page;
  if (params.page_size != null) q.page_size = params.page_size;
  const { data } = await api.get<PaginatedResponse<BuyingManifestPullLogEntry>>(
    '/buying/auctions/manifest_pull_log/',
    { params: q }
  );
  return data;
}

export async function fetchBuyingAuction(id: number): Promise<BuyingAuctionDetail> {
  const { data } = await api.get<BuyingAuctionDetail>(`/buying/auctions/${id}/`);
  return data;
}

/** Local recompute only (no B-Stock JWT); refreshes valuation fields on the auction. */
export async function postBuyingAuctionRecomputeValuation(
  auctionId: number
): Promise<BuyingAuctionDetail> {
  const { data } = await api.post<BuyingAuctionDetail>(
    `/buying/auctions/${auctionId}/recompute_valuation/`,
    {}
  );
  return data;
}

export async function fetchBuyingManifestRows(
  auctionId: number,
  params: BuyingManifestRowsParams = {}
): Promise<PaginatedResponse<BuyingManifestRow>> {
  const q: Record<string, string | number> = {};
  if (params.page != null) q.page = params.page;
  if (params.search) q.search = params.search;
  if (params.category) q.category = params.category;
  const { data } = await api.get<PaginatedResponse<BuyingManifestRow>>(
    `/buying/auctions/${auctionId}/manifest_rows/`,
    { params: q }
  );
  return data;
}

export async function postBuyingPullManifest(
  auctionId: number,
  options?: { force?: boolean }
): Promise<BuyingPullManifestResponse> {
  const { data } = await api.post<BuyingPullManifestResponse>(
    `/buying/auctions/${auctionId}/pull_manifest/`,
    { force: options?.force ?? false },
    // Two-worker pipeline can stream 1000 rows in ~40s; allow generous timeout.
    { timeout: 20 * 60 * 1000 }
  );
  return data;
}

export interface BuyingManifestPullLogSummary {
  id: number;
  started_at: string | null;
  completed_at: string | null;
  rows_downloaded: number;
  api_calls: number;
  duration_seconds: number;
  used_socks5: boolean;
  success: boolean;
  error_message: string;
}

/** In-process manifest pull counters (poll while POST pull_manifest is in flight). */
export interface BuyingManifestPullLive {
  phase: string | null;
  started_at: string | null;
  updated_at: string | null;
  total_rows_hint: number | null;
  api_calls: number;
  rows_fetched: number;
  rows_saved: number;
  batches_processed: number;
  template_source: string | null;
  ai_batches_run: number;
  ai_mappings_created: number;
  keys_remaining: number | null;
  ai_error: string | null;
}

export interface BuyingManifestPullProgress {
  auction_id: number;
  rows_downloaded: number;
  /** Populated while a pull runs on this dyno worker; null after completion or on another worker. */
  live: BuyingManifestPullLive | null;
  last_pull_log: BuyingManifestPullLogSummary | null;
}

/** Live row count + most-recent pull-log summary for polling an in-flight API pull. */
export async function fetchBuyingManifestPullProgress(
  auctionId: number
): Promise<BuyingManifestPullProgress> {
  const { data } = await api.get<BuyingManifestPullProgress>(
    `/buying/auctions/${auctionId}/manifest_pull_progress/`
  );
  return data;
}

/** Admin: run the nightly manifest queue for N seconds (long HTTP, ties up one Gunicorn worker). */
export async function postBuyingBudgetManifestPull(
  body: BuyingBudgetPullManifestBody
): Promise<BuyingBudgetPullManifestResponse> {
  const { data } = await api.post<BuyingBudgetPullManifestResponse>(
    '/buying/auctions/pull_manifests_budget/',
    body,
    // Long HTTP — allow seconds+120s headroom.
    { timeout: Math.max(60, body.seconds) * 1000 + 120 * 1000 }
  );
  return data;
}

export async function postBuyingUploadManifest(
  auctionId: number,
  file: File
): Promise<BuyingUploadManifestResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<BuyingUploadManifestResponse>(
    `/buying/auctions/${auctionId}/upload_manifest/`,
    form,
    {
      // Default axios Content-Type: application/json breaks multipart; browser must set boundary.
      transformRequest: [
        (body, headers) => {
          if (body instanceof FormData) {
            delete headers['Content-Type'];
          }
          return body;
        },
      ],
    }
  );
  return data;
}

export async function postBuyingMapFastCatBatch(
  auctionId: number
): Promise<BuyingMapFastCatBatchResponse> {
  const { data } = await api.post<BuyingMapFastCatBatchResponse>(
    `/buying/auctions/${auctionId}/map_fast_cat_batch/`,
    {}
  );
  return data;
}

export async function deleteBuyingManifest(auctionId: number): Promise<void> {
  await api.delete(`/buying/auctions/${auctionId}/manifest/`);
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
 * Triggers discovery (search API) + lightweight recompute. Does not require B-Stock JWT on the server
 * when enrich_detail is false. AI estimate is not run (server default); use query params only if you add them here.
 */
export async function postBuyingSweep(marketplaceSlug?: string | null): Promise<BuyingSweepResponse> {
  const params: Record<string, string> = {};
  if (marketplaceSlug) params.marketplace = marketplaceSlug;
  const { data } = await api.post<BuyingSweepResponse>('/buying/sweep/', null, {
    params,
  });
  return data;
}

export async function fetchBuyingCategoryNeed(): Promise<BuyingCategoryNeedResponse> {
  const { data } = await api.get<BuyingCategoryNeedResponse>('/buying/category-need/');
  return data;
}

export async function postBuyingThumbsUp(
  auctionId: number
): Promise<{ thumbs_up: boolean; thumbs_up_count: number }> {
  const { data } = await api.post<{ thumbs_up: boolean; thumbs_up_count: number }>(
    `/buying/auctions/${auctionId}/thumbs-up/`
  );
  return data;
}

export async function deleteBuyingThumbsUp(
  auctionId: number
): Promise<{ thumbs_up: boolean; thumbs_up_count: number }> {
  const { data } = await api.delete<{ thumbs_up: boolean; thumbs_up_count: number }>(
    `/buying/auctions/${auctionId}/thumbs-up/`
  );
  return data;
}

export async function patchBuyingValuationInputs(
  auctionId: number,
  body: BuyingValuationInputsPatch
): Promise<BuyingAuctionDetail> {
  const { data } = await api.patch<BuyingAuctionDetail>(
    `/buying/auctions/${auctionId}/valuation-inputs/`,
    body
  );
  return data;
}

/** POST: set archived_at (hide from default lists). DELETE: clear archived_at. */
export async function postBuyingAuctionArchive(auctionId: number): Promise<BuyingAuctionDetail> {
  const { data } = await api.post<BuyingAuctionDetail>(`/buying/auctions/${auctionId}/archive/`, {});
  return data;
}

export async function deleteBuyingAuctionArchive(auctionId: number): Promise<BuyingAuctionDetail> {
  const { data } = await api.delete<BuyingAuctionDetail>(`/buying/auctions/${auctionId}/archive/`);
  return data;
}

export async function fetchBuyingBstockTokenStatus(): Promise<BuyingBstockTokenStatus> {
  const { data } = await api.get<BuyingBstockTokenStatus>('/buying/bstock_token_status/');
  return data;
}

/** JWT: merge B-Stock auction state and run lightweight valuation. */
export async function postBuyingAuctionRefreshFromBstock(auctionId: number): Promise<BuyingAuctionDetail> {
  const { data } = await api.post<BuyingAuctionDetail>(
    `/buying/auctions/${auctionId}/refresh_from_bstock/`,
    {}
  );
  return data;
}

/** JWT: poll all due watchlist rows (same as ``run_watch_poll``). */
export async function postBuyingWatchlistUpdateNow(): Promise<Record<string, unknown>> {
  const { data } = await api.post<Record<string, unknown>>('/buying/watchlist/update_now/', {});
  return data;
}
