import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWebListing,
  deleteWebListing,
  deleteWebListingImage,
  getCategoryOptions,
  getWebListing,
  getWebListings,
  getWebOrder,
  getWebOrders,
  setWebOrderStatus,
  updateWebListing,
  updateWebOrder,
  uploadWebListingImage,
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

export function useSetWebOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await setWebOrderStatus(id, status);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webOrders'] });
      queryClient.invalidateQueries({ queryKey: ['webOrders', variables.id] });
      // A cancellation restocks listings.
      queryClient.invalidateQueries({ queryKey: ['webListings'] });
    },
  });
}
