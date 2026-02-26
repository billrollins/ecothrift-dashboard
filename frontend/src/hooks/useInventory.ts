import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderDeletePreview,
  purgeDeleteOrder,
  markOrderPaid,
  revertOrderPaid,
  markOrderShipped,
  revertOrderShipped,
  deliverOrder,
  revertOrderDelivered,
  uploadManifest,
  getManifestRows,
  previewStandardize,
  processManifest,
  updateManifestPricing,
  matchProducts,
  createItems,
  checkInOrderItems,
  markOrderComplete,
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  checkInItem,
  markItemReady,
  getBatchGroups,
  getBatchGroup,
  updateBatchGroup,
  checkInBatchGroup,
  processBatchGroup,
  detachBatchItem,
  getItemHistory,
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  suggestFormulas,
  aiCleanupRows,
  getAICleanupStatus,
  cancelAICleanup,
  clearManifestRows,
  getMatchResults,
  reviewMatches,
  suggestFinalization,
  finalizeRows,
  undoProductMatching,
  clearPricing,
} from '../api/inventory.api';
import type {
  SuggestFormulasPayload,
  AICleanupRowsPayload,
  MatchProductsPayload,
  ReviewMatchesPayload,
  SuggestFinalizationPayload,
  FinalizeRowsPayload,
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

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateOrder(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.id] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await deleteOrder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useOrderDeletePreview() {
  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await getOrderDeletePreview(orderId);
      return data;
    },
  });
}

export function usePurgeDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      data,
    }: {
      orderId: number;
      data: { confirm_order_number: string };
    }) => {
      const { data: result } = await purgeDeleteOrder(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.removeQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['itemHistory'] });
      queryClient.invalidateQueries({ queryKey: ['manifestRowsRaw'] });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      date,
    }: {
      id: number;
      date?: string;
    }) => {
      const { data } = await markOrderPaid(id, date);
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

export function useRevertOrderPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await revertOrderPaid(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useMarkOrderShipped() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: { shipped_date?: string; expected_delivery?: string };
    }) => {
      const { data: result } = await markOrderShipped(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useRevertOrderShipped() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await revertOrderShipped(id);
      return data;
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
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
    },
  });
}

export function useRevertOrderDelivered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await revertOrderDelivered(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
    },
  });
}

export function useManifestRows(orderId: number | null, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['manifestRowsRaw', orderId, params],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getManifestRows(orderId, params);
      return data;
    },
    enabled: orderId != null,
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
      queryClient.invalidateQueries({ queryKey: ['manifestRowsRaw'] });
    },
  });
}

export function usePreviewStandardize() {
  return useMutation({
    mutationFn: async ({
      orderId,
      data,
    }: {
      orderId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await previewStandardize(orderId, data);
      return result;
    },
  });
}

export function useUpdateManifestPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      data,
    }: {
      orderId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateManifestPricing(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', variables.orderId] });
    },
  });
}

export function useSuggestFormulas() {
  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data?: SuggestFormulasPayload }) => {
      const { data: result } = await suggestFormulas(orderId, data);
      return result;
    },
  });
}

export function useAICleanupRows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data?: AICleanupRowsPayload }) => {
      const { data: result } = await aiCleanupRows(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', variables.orderId] });
    },
  });
}

export function useAICleanupStatus(orderId: number | null) {
  return useQuery({
    queryKey: ['aiCleanupStatus', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getAICleanupStatus(orderId);
      return data;
    },
    enabled: orderId != null,
  });
}

export function useCancelAICleanup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await cancelAICleanup(orderId);
      return data;
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', orderId] });
    },
  });
}

export function useClearManifestRows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await clearManifestRows(orderId);
      return data;
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', orderId] });
    },
  });
}

export function useUndoProductMatching() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await undoProductMatching(orderId);
      return data;
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', orderId] });
    },
  });
}

export function useClearPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await clearPricing(orderId);
      return data;
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', orderId] });
    },
  });
}

export function useMatchProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data?: MatchProductsPayload }) => {
      const { data: result } = await matchProducts(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', variables.orderId] });
    },
  });
}

export function useMatchResults(orderId: number | null | undefined) {
  return useQuery({
    queryKey: ['matchResults', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getMatchResults(orderId);
      return data;
    },
    enabled: !!orderId,
  });
}

export function useReviewMatches() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data: ReviewMatchesPayload }) => {
      const { data: result } = await reviewMatches(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', variables.orderId] });
    },
  });
}

export function useSuggestFinalization() {
  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data?: SuggestFinalizationPayload }) => {
      const { data: result } = await suggestFinalization(orderId, data);
      return result;
    },
  });
}

export function useFinalizeRows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: number; data: FinalizeRowsPayload }) => {
      const { data: result } = await finalizeRows(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['matchResults', variables.orderId] });
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
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
    },
  });
}

export function useMarkOrderComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await markOrderComplete(orderId);
      return data;
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
    },
  });
}

export function useCheckInOrderItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      data,
    }: {
      orderId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await checkInOrderItems(orderId, data);
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
    },
  });
}

export function useItems(params?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await getItems(params);
      return data;
    },
    enabled,
  });
}

export function useBatchGroups(params?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ['batchGroups', params],
    queryFn: async () => {
      const { data } = await getBatchGroups(params);
      return data;
    },
    enabled,
  });
}

export function useBatchGroup(id: number | null) {
  return useQuery({
    queryKey: ['batchGroups', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getBatchGroup(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useProcessBatchGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string };
    }) => {
      const { data: result } = await processBatchGroup(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useUpdateBatchGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string; notes?: string };
    }) => {
      const { data: result } = await updateBatchGroup(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useCheckInBatchGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string };
    }) => {
      const { data: result } = await checkInBatchGroup(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useDetachBatchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, itemId }: { id: number; itemId?: number }) => {
      const { data } = await detachBatchItem(id, itemId ? { item_id: itemId } : undefined);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
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

export function useCheckInItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await checkInItem(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useItem(id: number | null) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getItem(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createItem(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await deleteItem(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useItemHistory(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['itemHistory', params],
    queryFn: async () => {
      const { data } = await getItemHistory(params);
      return data;
    },
  });
}

export function useCategories(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['categories', params],
    queryFn: async () => {
      const { data } = await getCategories(params);
      return data;
    },
  });
}

export function useCategory(id: number | null) {
  return useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getCategory(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createCategory(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateCategory(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', variables.id] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await deleteCategory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
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
