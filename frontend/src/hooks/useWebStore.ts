import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignConversation,
  createWebListing,
  deleteWebListing,
  deleteWebListingImage,
  getCategoryOptions,
  getConversation,
  getConversations,
  getReservations,
  getSalesLog,
  getWebListing,
  getWebListings,
  getWebOrder,
  getWebOrders,
  getWorkQueue,
  archiveWebListing,
  generateFbCopy,
  markFbPosted,
  pauseWebListing,
  publishWebListing,
  reopenConversation,
  replyConversation,
  reservationAction,
  resolveConversation,
  restoreWebListing,
  updateWebListing,
  updateWebOrder,
  uploadWebListingImage,
  type ConversationParams,
  type ReservationParams,
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

export function useReservations(params?: ReservationParams) {
  return useQuery({
    queryKey: ['webReservations', params],
    queryFn: async () => {
      const { data } = await getReservations(params);
      return data;
    },
  });
}

export function useReservationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: number;
      action: 'confirm' | 'stage' | 'decline' | 'cancel' | 'expire' | 'complete';
    }) => {
      const { data } = await reservationAction(id, action);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webReservations'] });
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
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

export function useSalesLog() {
  return useQuery({
    queryKey: ['webSalesLog'],
    queryFn: async () => {
      const { data } = await getSalesLog();
      return data.results;
    },
  });
}

export function useConversations(params?: ConversationParams) {
  return useQuery({
    queryKey: ['webConversations', params],
    queryFn: async () => {
      const { data } = await getConversations(params);
      return data;
    },
  });
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: ['webConversations', id],
    queryFn: async () => {
      const { data } = await getConversation(id!);
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
      mutationFn: async ({ id, body }: { id: number; body: string }) =>
        (await replyConversation(id, body)).data,
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
