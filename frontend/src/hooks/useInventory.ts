import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  getOrders,
  getOrder,
  createOrder,
  deliverOrder,
  uploadManifest,
  processManifest,
  createItems,
  getItems,
  updateItem,
  markItemReady,
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
} from '../api/inventory.api';

export function useVendors(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['vendors', params],
    queryFn: async () => {
      const { data } = await getVendors(params);
      return data;
    },
  });
}

export function useVendor(id: number | null) {
  return useQuery({
    queryKey: ['vendors', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getVendor(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createVendor(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateVendor(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendors', variables.id] });
    },
  });
}

export function usePurchaseOrders(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['purchaseOrders', params],
    queryFn: async () => {
      const { data } = await getOrders(params);
      return data;
    },
  });
}

export function usePurchaseOrder(id: number | null) {
  return useQuery({
    queryKey: ['purchaseOrders', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getOrder(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createOrder(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useDeliverOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      date,
    }: {
      id: number;
      date?: string;
    }) => {
      const { data } = await deliverOrder(id, date);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({
        queryKey: ['purchaseOrders', variables.id],
      });
    },
  });
}

export function useUploadManifest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, file }: { orderId: number; file: File }) => {
      const { data } = await uploadManifest(orderId, file);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useProcessManifest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      data,
    }: {
      orderId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await processManifest(orderId, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useCreateItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await createItems(orderId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useItems(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await getItems(params);
      return data;
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateItem(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', variables.id] });
    },
  });
}

export function useMarkItemReady() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await markItemReady(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProducts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      const { data } = await getProducts(params);
      return data;
    },
  });
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getProduct(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createProduct(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateProduct(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', variables.id] });
    },
  });
}
