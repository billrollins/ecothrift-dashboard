import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  deleteBuyingAuctionArchive,
  postBuyingAuctionArchive,
} from '../api/buying.api';
import type { BuyingAuctionListItem } from '../types/buying.types';
import {
  optimisticArchiveRow,
  patchAllBuyingAuctionLists,
  patchAllBuyingWatchlistLists,
  removeAuctionFromAllBuyingLists,
} from './buyingOptimisticCache';

/** Duration of the single-row archive grace window in milliseconds. */
export const BUYING_ARCHIVE_GRACE_MS = 2000;

type PendingEntry = {
  /** Target state the commit will apply (true = archive, false = unarchive). */
  archive: boolean;
  /** Original `archived_at` on the row before the optimistic patch. */
  originalArchivedAt: string | null;
  /** Commit timer that hides the row + fires the network call. */
  timerId: ReturnType<typeof setTimeout>;
  /** Monotonic `performance.now()` at schedule time (for the ring animation). */
  startedAt: number;
};

/**
 * Page-level hook managing the 2s grace window on single-row archive/unarchive.
 *
 * Behavior:
 * 1. `schedule(row)` -> optimistic icon flip (cache patch) + 2s timer.
 * 2. Re-call `schedule(row)` with same id before the timer fires -> cancel: revert patch, no POST.
 * 3. After 2s -> remove row from list cache (hides row without refetch), then POST/DELETE.
 * 4. On server error -> invalidate the list so the row can reappear + snackbar.
 */
export function useBuyingArchiveGrace() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const pendingRef = useRef<Map<number, PendingEntry>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());

  const refreshPendingSet = useCallback(() => {
    setPendingIds(new Set(pendingRef.current.keys()));
  }, []);

  useEffect(() => {
    return () => {
      for (const entry of pendingRef.current.values()) {
        clearTimeout(entry.timerId);
      }
      pendingRef.current.clear();
    };
  }, []);

  const revertOptimistic = useCallback(
    (id: number, originalArchivedAt: string | null) => {
      patchAllBuyingAuctionLists(queryClient, id, (r) => ({
        ...r,
        archived_at: originalArchivedAt,
      }));
      patchAllBuyingWatchlistLists(queryClient, id, (r) => ({
        ...r,
        archived_at: originalArchivedAt,
      }));
    },
    [queryClient]
  );

  const cancel = useCallback(
    (id: number): boolean => {
      const entry = pendingRef.current.get(id);
      if (!entry) return false;
      clearTimeout(entry.timerId);
      pendingRef.current.delete(id);
      revertOptimistic(id, entry.originalArchivedAt);
      refreshPendingSet();
      return true;
    },
    [revertOptimistic, refreshPendingSet]
  );

  const commit = useCallback(
    async (id: number) => {
      const entry = pendingRef.current.get(id);
      if (!entry) return;
      pendingRef.current.delete(id);
      refreshPendingSet();
      removeAuctionFromAllBuyingLists(queryClient, id);
      try {
        if (entry.archive) {
          await postBuyingAuctionArchive(id);
        } else {
          await deleteBuyingAuctionArchive(id);
        }
        void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'summary'] });
        void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', id] });
      } catch {
        enqueueSnackbar('Could not update archive state.', { variant: 'error' });
        void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
        void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
        void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'summary'] });
      }
    },
    [queryClient, enqueueSnackbar, refreshPendingSet]
  );

  /**
   * Start a 2s grace window on (un)archiving `row`. If already pending for the
   * same id, the second call cancels the commit instead.
   */
  const schedule = useCallback(
    (row: BuyingAuctionListItem) => {
      const id = row.id;
      if (pendingRef.current.has(id)) {
        cancel(id);
        return;
      }
      const originalArchivedAt = row.archived_at ?? null;
      const archive = !originalArchivedAt;
      patchAllBuyingAuctionLists(queryClient, id, (r) => optimisticArchiveRow(r, archive));
      patchAllBuyingWatchlistLists(queryClient, id, (r) => ({
        ...r,
        ...optimisticArchiveRow(r, archive),
      }));
      const timerId = setTimeout(() => {
        void commit(id);
      }, BUYING_ARCHIVE_GRACE_MS);
      pendingRef.current.set(id, {
        archive,
        originalArchivedAt,
        timerId,
        startedAt: performance.now(),
      });
      refreshPendingSet();
    },
    [queryClient, cancel, commit, refreshPendingSet]
  );

  /** Monotonic start time (`performance.now()`) so the ring can run its own rAF loop. */
  const getStartedAt = useCallback((id: number): number | null => {
    return pendingRef.current.get(id)?.startedAt ?? null;
  }, []);

  return {
    pendingIds,
    schedule,
    cancel,
    getStartedAt,
  };
}

export type BuyingArchiveGrace = ReturnType<typeof useBuyingArchiveGrace>;
