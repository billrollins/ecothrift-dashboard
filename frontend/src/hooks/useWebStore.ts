import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveConversation,
  assignConversation,
  createWebListing,
  deleteWebListing,
  deleteWebListingImage,
  getCategoryOptions,
  getConversation,
  getConversations,
  addReservationNote,
  getReservationDetail,
  getReservations,
  getSalesLog,
  getWebListing,
  getWebListings,
  getWebOrder,
  getWebOrders,
  getWebstoreConfig,
  getWorkQueue,
  removeWorkQueueItem,
  archiveWebListing,
  generateFbCopy,
  markFbPosted,
  markWebListingSold,
  pauseWebListing,
  publishWebListing,
  reopenConversation,
  reorderWebListingImage,
  replyConversation,
  reservationAction,
  resolveConversation,
  restoreWebListing,
  unarchiveConversation,
  updateWebListing,
  updateWebListingImageAlt,
  updateWebOrder,
  uploadWebListingImage,
  type ConversationParams,
  type ReservationActionName,
  type ReservationParams,
  type SalesLogParams,
  type WebListingParams,
  type WebOrderParams,
} from '../api/webstore.api';

export function useWebListings(params?: WebListingParams) {
  return useQuery({
    queryKey: ['webListings', params],
    queryFn: async () => {
      const { data } = await getWebListings(params);
      return data;
    },
  });
}

export function useWebListing(id: number | null) {
  return useQuery({
    queryKey: ['webListings', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getWebListing(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createWebListing(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webWorkQueue'] });
    },
  });
}

export function useUpdateWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateWebListing(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', variables.id] });
    },
  });
}

export function useDeleteWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteWebListing(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webWorkQueue'] });
    },
  });
}

export function useUploadWebListingImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, alt }: { id: number; file: File; alt?: string }) => {
      const { data } = await uploadWebListingImage(id, file, alt);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', variables.id] });
    },
  });
}

export function useDeleteWebListingImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, imageId }: { listingId: number; imageId: number }) => {
      await deleteWebListingImage(listingId, imageId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', variables.listingId] });
    },
  });
}

export function useReorderWebListingImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, order }: { listingId: number; order: number[] }) => {
      const { data } = await reorderWebListingImage(listingId, order);
      return data;
    },
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function useUpdateWebListingImageAlt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listingId,
      imageId,
      alt,
    }: {
      listingId: number;
      imageId: number;
      alt: string;
    }) => {
      const { data } = await updateWebListingImageAlt(listingId, imageId, alt);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', variables.listingId] });
    },
  });
}

export function useMarkWebListingSold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await markWebListingSold(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
      queryClient.invalidateQueries({ queryKey: ['webWorkQueue'] });
    },
  });
}

export function useWebstoreConfig() {
  return useQuery({
    queryKey: ['webstoreConfig'],
    queryFn: async () => {
      const { data } = await getWebstoreConfig();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategoryOptions() {
  return useQuery({
    queryKey: ['categoryOptions'],
    queryFn: async () => {
      const { data } = await getCategoryOptions();
      return data.categories
        .filter((c) => c.id != null)
        .map((c) => ({ id: c.id as number, name: c.name, slug: c.slug }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Orders ────────────────────────────────────────────────────────────────

export function useWebOrders(params?: WebOrderParams) {
  return useQuery({
    queryKey: ['webOrders', params],
    queryFn: async () => {
      const { data } = await getWebOrders(params);
      return data;
    },
  });
}

export function useWebOrder(id: number | null) {
  return useQuery({
    queryKey: ['webOrders', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getWebOrder(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useUpdateWebOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateWebOrder(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webOrders'] });
      queryClient.invalidateQueries({ queryKey: ['webOrders', variables.id] });
    },
  });
}

export function useReservations(
  params?: ReservationParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['webReservations', params],
    queryFn: async () => {
      const { data } = await getReservations(params);
      return data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useReservationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: number;
      action: ReservationActionName;
      reason?: string;
    }) => {
      const { data } = await reservationAction(
        id,
        action,
        reason != null ? { reason } : undefined,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['webReservations'] });
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webSalesLog'] });
      queryClient.invalidateQueries({ queryKey: ['webReservationDetail', vars.id] });
    },
  });
}

export function useAddReservationNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const { data } = await addReservationNote(id, note);
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['webReservationDetail', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['webReservations'] });
      queryClient.invalidateQueries({ queryKey: ['webSalesLog'] });
    },
  });
}

export function useWorkQueue() {
  return useQuery({
    queryKey: ['webWorkQueue'],
    queryFn: async () => {
      const { data } = await getWorkQueue();
      return data;
    },
  });
}

export function useRemoveWorkQueueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: number) => {
      const { data } = await removeWorkQueueItem(itemId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webWorkQueue'] });
    },
  });
}

export function useSalesLog(params?: SalesLogParams) {
  return useQuery({
    queryKey: ['webSalesLog', params],
    queryFn: async () => {
      const { data } = await getSalesLog(params);
      return data.results;
    },
  });
}

export function useReservationDetail(id: number | null) {
  return useQuery({
    queryKey: ['webReservationDetail', id],
    queryFn: async () => {
      const { data } = await getReservationDetail(id!);
      return data;
    },
    enabled: id != null,
  });
}

export function useConversations(params?: ConversationParams) {
  return useQuery({
    queryKey: ['webConversations', params],
    queryFn: async () => {
      const { data } = await getConversations(params);
      return data;
    },
    // Filter toggles must not flash LoadingScreen - keep the last page on
    // screen until the next one lands, and reuse recent filter results.
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });
}

/** Threads where Eco-Thrift owes the next action. Drives Customers / Messages
 *  badges and matches the Messages "Needs reply" filter - not unread mail. */
export const NEEDS_REPLY_PARAMS: ConversationParams = {
  state: 'needs_reply',
  archived: '0',
  ordering: '-last_message_at',
};

/**
 * Count of conversations waiting on staff (your next action).
 *
 * Reads the paginated `count` rather than summing page-one rows.
 */
export function useNeedsReplyCount(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ['webConversations', NEEDS_REPLY_PARAMS],
    queryFn: async () => {
      const { data } = await getConversations(NEEDS_REPLY_PARAMS);
      return data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
  return query.data?.count ?? 0;
}

export function useConversation(id: number | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['webConversations', id],
    queryFn: async () => {
      const { data } = await getConversation(id!);
      // Retrieve marks the thread staff-read - refresh list + badge counts.
      void queryClient.invalidateQueries({
        queryKey: ['webConversations'],
        predicate: (q) => typeof q.queryKey[1] === 'object',
      });
      return data;
    },
    enabled: id != null,
  });
}

export function useConversationActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['webConversations'] });
  };
  return {
    reply: useMutation({
      mutationFn: async ({ id, body, subject }: { id: number; body: string; subject?: string }) =>
        (await replyConversation(id, body, subject)).data,
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: async (id: number) => (await assignConversation(id)).data,
      onSuccess: invalidate,
    }),
    resolve: useMutation({
      mutationFn: async (id: number) => (await resolveConversation(id)).data,
      onSuccess: invalidate,
    }),
    reopen: useMutation({
      mutationFn: async (id: number) => (await reopenConversation(id)).data,
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: async (id: number) => (await archiveConversation(id)).data,
      onSuccess: invalidate,
    }),
    unarchive: useMutation({
      mutationFn: async (id: number) => (await unarchiveConversation(id)).data,
      onSuccess: invalidate,
    }),
  };
}

export function usePublishWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await publishWebListing(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function usePauseWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await pauseWebListing(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function useArchiveWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await archiveWebListing(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function useRestoreWebListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await restoreWebListing(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function useGenerateFbCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await generateFbCopy(id)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}

export function useMarkFbPosted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, url }: { id: number; url?: string }) =>
      (await markFbPosted(id, url)).data,
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['webListings', listing.id] });
    },
  });
}
