import type { Query, QueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '../types/common.types';
import type {
  BuyingAuctionListItem,
  BuyingWatchlistAuctionItem,
  BuyingWatchlistEntry,
} from '../types/buying.types';

function patchAuctionResults(
  old: PaginatedResponse<BuyingAuctionListItem> | undefined,
  auctionId: number,
  patch: (row: BuyingAuctionListItem) => BuyingAuctionListItem
): PaginatedResponse<BuyingAuctionListItem> | undefined {
  if (!old?.results) return old;
  return {
    ...old,
    results: old.results.map((r) => (r.id === auctionId ? patch(r) : r)),
  };
}

function patchWatchlistResults(
  old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined,
  auctionId: number,
  patch: (row: BuyingWatchlistAuctionItem) => BuyingWatchlistAuctionItem
): PaginatedResponse<BuyingWatchlistAuctionItem> | undefined {
  if (!old?.results) return old;
  return {
    ...old,
    results: old.results.map((r) => (r.id === auctionId ? patch(r) : r)),
  };
}

/**
 * Paginated GET /buying/auctions/ list only (`['buying','auctions', page, page_size, …]`).
 * Excludes infinite, detail, summary, manifest rows, etc.
 */
export function isBuyingAuctionsPaginatedListQuery(query: Query): boolean {
  const k = query.queryKey;
  return (
    Array.isArray(k) &&
    k[0] === 'buying' &&
    k[1] === 'auctions' &&
    typeof k[2] === 'number' &&
    typeof k[3] === 'number'
  );
}

/**
 * Paginated GET /buying/watchlist/ list only (`['buying','watchlist', page, page_size, …]`).
 * Excludes tint-ids helper and infinite scroll cache.
 */
export function isBuyingWatchlistAuctionListQuery(query: Query): boolean {
  const k = query.queryKey;
  return (
    Array.isArray(k) &&
    k[0] === 'buying' &&
    k[1] === 'watchlist' &&
    typeof k[2] === 'number' &&
    typeof k[3] === 'number'
  );
}

/** Patch every buying auction list query (paginated). */
export function patchAllBuyingAuctionLists(
  queryClient: QueryClient,
  auctionId: number,
  patch: (row: BuyingAuctionListItem) => BuyingAuctionListItem
): void {
  queryClient.setQueriesData(
    { predicate: isBuyingAuctionsPaginatedListQuery },
    (old: PaginatedResponse<BuyingAuctionListItem> | undefined) => patchAuctionResults(old, auctionId, patch)
  );
}

/** Patch every buying watchlist list query (paginated). Excludes `['buying','watchlist','tint-ids']`. */
export function patchAllBuyingWatchlistLists(
  queryClient: QueryClient,
  auctionId: number,
  patch: (row: BuyingWatchlistAuctionItem) => BuyingWatchlistAuctionItem
): void {
  queryClient.setQueriesData(
    { predicate: isBuyingWatchlistAuctionListQuery },
    (old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined) => patchWatchlistResults(old, auctionId, patch)
  );
}

function stubWatchlistEntry(): BuyingWatchlistEntry {
  return {
    id: -1,
    priority: '',
    status: '',
    notes: '',
    poll_interval_seconds: 300,
    last_polled_at: null,
    added_at: new Date().toISOString(),
  };
}

export function toWatchlistAuctionItem(row: BuyingAuctionListItem): BuyingWatchlistAuctionItem {
  return {
    ...row,
    watchlist_entry: stubWatchlistEntry(),
  };
}

/** Find an auction row from any cached buying list (auctions or watchlist pages). */
export function findAuctionRowInCache(queryClient: QueryClient, auctionId: number): BuyingAuctionListItem | undefined {
  const auctionDatas = queryClient.getQueriesData<PaginatedResponse<BuyingAuctionListItem>>({
    predicate: isBuyingAuctionsPaginatedListQuery,
  });
  for (const [, data] of auctionDatas) {
    const hit = data?.results?.find((r) => r.id === auctionId);
    if (hit) return hit;
  }
  const watchDatas = queryClient.getQueriesData<PaginatedResponse<BuyingWatchlistAuctionItem>>({
    predicate: isBuyingWatchlistAuctionListQuery,
  });
  for (const [, data] of watchDatas) {
    const hit = data?.results?.find((r) => r.id === auctionId);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Optimistically update first-page tint ids used for row highlight (count ≤ 100 only).
 */
export function patchTintIdsForWatch(queryClient: QueryClient, auctionId: number, add: boolean): void {
  queryClient.setQueryData<PaginatedResponse<BuyingWatchlistAuctionItem> | undefined>(
    ['buying', 'watchlist', 'tint-ids'],
    (old) => {
      if (!old || old.count > 100) return old;
      const list = old.results ?? [];
      if (add) {
        if (list.some((r) => r.id === auctionId)) return old;
        const row = findAuctionRowInCache(queryClient, auctionId);
        if (!row) return old;
        const entry = toWatchlistAuctionItem(row);
        return { ...old, results: [...list, entry], count: old.count + 1 };
      }
      return {
        ...old,
        results: list.filter((r) => r.id !== auctionId),
        count: Math.max(0, old.count - 1),
      };
    }
  );
}

/**
 * Remove an auction row from every paginated auction list + watchlist cache. Used by the archive
 * grace commit to make the row disappear without refetching. Also removes it from infinite pages.
 */
export function removeAuctionFromAllBuyingLists(queryClient: QueryClient, auctionId: number): void {
  queryClient.setQueriesData(
    { predicate: isBuyingAuctionsPaginatedListQuery },
    (old: PaginatedResponse<BuyingAuctionListItem> | undefined) => {
      if (!old?.results) return old;
      if (!old.results.some((r) => r.id === auctionId)) return old;
      return {
        ...old,
        results: old.results.filter((r) => r.id !== auctionId),
        count: Math.max(0, old.count - 1),
      };
    }
  );
  queryClient.setQueriesData(
    { predicate: isBuyingWatchlistAuctionListQuery },
    (old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined) => {
      if (!old?.results) return old;
      if (!old.results.some((r) => r.id === auctionId)) return old;
      return {
        ...old,
        results: old.results.filter((r) => r.id !== auctionId),
        count: Math.max(0, old.count - 1),
      };
    }
  );
  queryClient.setQueriesData(
    {
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === 'buying' && k[1] === 'auctions' && k[2] === 'infinite';
      },
    },
    (old: { pages?: PaginatedResponse<BuyingAuctionListItem>[]; pageParams?: unknown[] } | undefined) => {
      if (!old?.pages) return old;
      const pages = old.pages.map((p) => {
        if (!p.results?.some((r) => r.id === auctionId)) return p;
        return {
          ...p,
          results: p.results.filter((r) => r.id !== auctionId),
          count: Math.max(0, p.count - 1),
        };
      });
      return { ...old, pages };
    }
  );
  queryClient.setQueriesData(
    {
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === 'buying' && k[1] === 'watchlist' && k[2] === 'infinite';
      },
    },
    (old: { pages?: PaginatedResponse<BuyingWatchlistAuctionItem>[]; pageParams?: unknown[] } | undefined) => {
      if (!old?.pages) return old;
      const pages = old.pages.map((p) => {
        if (!p.results?.some((r) => r.id === auctionId)) return p;
        return {
          ...p,
          results: p.results.filter((r) => r.id !== auctionId),
          count: Math.max(0, p.count - 1),
        };
      });
      return { ...old, pages };
    }
  );
}

/** Remove a row from paginated watchlist list caches (when unwatching). */
export function patchWatchlistRemoveAuction(queryClient: QueryClient, auctionId: number): void {
  queryClient.setQueriesData(
    { predicate: isBuyingWatchlistAuctionListQuery },
    (old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined) => {
      if (!old?.results) return old;
      if (!old.results.some((r) => r.id === auctionId)) return old;
      return {
        ...old,
        results: old.results.filter((r) => r.id !== auctionId),
        count: Math.max(0, old.count - 1),
      };
    }
  );
}

export function optimisticThumbsRow(
  row: BuyingAuctionListItem,
  active: boolean
): BuyingAuctionListItem {
  const was = Boolean(row.thumbs_up);
  let nextCount = row.thumbs_up_count ?? 0;
  if (active && !was) nextCount += 1;
  if (!active && was) nextCount = Math.max(0, nextCount - 1);
  return {
    ...row,
    thumbs_up: active,
    thumbs_up_count: nextCount,
  };
}

export function optimisticArchiveRow(
  row: BuyingAuctionListItem,
  archive: boolean
): BuyingAuctionListItem {
  return {
    ...row,
    archived_at: archive ? new Date().toISOString() : null,
  };
}

function mapRowsByIds<T extends BuyingAuctionListItem>(
  old: PaginatedResponse<T> | undefined,
  ids: Set<number>,
  mapRow: (row: T) => T
): PaginatedResponse<T> | undefined {
  if (!old?.results) return old;
  return {
    ...old,
    results: old.results.map((r) => (ids.has(r.id) ? mapRow(r) : r)),
  };
}

export function patchThumbsBulk(queryClient: QueryClient, ids: number[], active: boolean): void {
  const idSet = new Set(ids);
  queryClient.setQueriesData(
    { predicate: isBuyingAuctionsPaginatedListQuery },
    (old: PaginatedResponse<BuyingAuctionListItem> | undefined) =>
      mapRowsByIds(old, idSet, (row) => optimisticThumbsRow(row, active))
  );
  queryClient.setQueriesData(
    { predicate: isBuyingWatchlistAuctionListQuery },
    (old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined) =>
      mapRowsByIds(old, idSet, (row) => ({
        ...row,
        ...optimisticThumbsRow(row, active),
      }))
  );
}

export function patchArchiveBulk(queryClient: QueryClient, ids: number[], archive: boolean): void {
  const idSet = new Set(ids);
  queryClient.setQueriesData(
    { predicate: isBuyingAuctionsPaginatedListQuery },
    (old: PaginatedResponse<BuyingAuctionListItem> | undefined) =>
      mapRowsByIds(old, idSet, (row) => optimisticArchiveRow(row, archive))
  );
  queryClient.setQueriesData(
    { predicate: isBuyingWatchlistAuctionListQuery },
    (old: PaginatedResponse<BuyingWatchlistAuctionItem> | undefined) =>
      mapRowsByIds(old, idSet, (row) => ({
        ...row,
        ...optimisticArchiveRow(row, archive),
      }))
  );
}

export function patchWatchBulk(queryClient: QueryClient, ids: number[], add: boolean): void {
  for (const id of ids) {
    if (!add) {
      patchWatchlistRemoveAuction(queryClient, id);
    }
    patchTintIdsForWatch(queryClient, id, add);
  }
}
