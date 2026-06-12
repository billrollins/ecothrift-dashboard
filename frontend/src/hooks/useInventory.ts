import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  getOrders,
  getOrderSummary,
  getPreprocessingQueue,
  getOrder,
  getOrderDetailSurface,
  getOrderProcessingStats,
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
  removeManifest,
  getUndoPreview,
  postIntakeUndo,
  previewStandardize,
  processManifest,
  updateManifestPricing,
  createItems,
  finalizePreprocessing,
  markOrderComplete,
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  getItem,
  getItemStats,
  createItem,
  suggestItem,
  updateItem,
  deleteItem,
  checkInItem,
  markItemBroken,
  uncheckInItem,
  checkInOrderItems,
  bulkMarkBroken,
  bulkUncheckIn,
  markItemReady,
  getBatchGroups,
  getBatchGroup,
  updateBatchGroup,
  checkInBatchGroup,
  processBatchGroup,
  detachBatchItem,
  getItemHistory,
  suggestFormulas,
  getAICleanupStatus,
  cancelAICleanup,
  suggestFinalization,
  finalizeRows,
  getCleanupModels,
  addCleanupModel,
  setDefaultCleanupModel,
  verifyCleanupModel,
  downloadCleanupCsv,
  uploadCleanupCsv,
  uploadCleanupCsvRows,
  getPreprocessingStatus,
  getPreprocessingReview,
  updatePreprocessingReview,
  resetPreprocessingReviewFinal,
  getManualReview,
  updateManualReview,
  getManifestFieldMetadata,
} from '../api/inventory.api';
import { prepS1 } from '../utils/preprocessingStep1Diag';
import { devLog } from '../utils/logger';
import type {
  SuggestFormulasPayload,
  IntakeUndoStage,
  SuggestFinalizationPayload,
  FinalizeRowsPayload,
  SuggestItemRequest,
  CleanupModelOption,
  ManualReviewParams,
  ManualReviewRowUpdate,
  PreprocessingReviewParams,
  PreprocessingReviewRowUpdate,
  PreprocessingReviewResetFinalPayload,
} from '../api/inventory.api';
import type { PaginatedResponse } from '../types/common.types';
import type { Item, PurchaseOrder, PurchaseOrderListRow, PurchaseOrderSummary, PreprocessingQueueResponse } from '../types/inventory.types';

type PurchaseOrdersQueryOptions = Pick<
  UseQueryOptions<PaginatedResponse<PurchaseOrderListRow>>,
  'enabled' | 'placeholderData' | 'staleTime'
>;

type PurchaseOrderSummaryQueryOptions = Pick<
  UseQueryOptions<PurchaseOrderSummary>,
  'enabled' | 'placeholderData' | 'staleTime'
>;

type ItemsQueryOptions = Pick<
  UseQueryOptions<PaginatedResponse<Item>>,
  'enabled' | 'placeholderData' | 'staleTime'
>;

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

export function usePurchaseOrders(
  params?: Record<string, unknown>,
  options: boolean | PurchaseOrdersQueryOptions = true,
) {
  const { enabled, placeholderData, staleTime } =
    typeof options === 'boolean' ? { enabled: options } : { enabled: true, ...options };
  return useQuery<PaginatedResponse<PurchaseOrderListRow>>({
    queryKey: ['purchaseOrders', params],
    queryFn: async () => {
      const { data } = await getOrders(params);
      return data;
    },
    enabled: enabled !== false,
    placeholderData,
    staleTime,
  });
}

export function usePreprocessingQueue(enabled = true) {
  return useQuery<PreprocessingQueueResponse>({
    queryKey: ['preprocessingQueue'],
    queryFn: async () => {
      const { data } = await getPreprocessingQueue();
      return data;
    },
    enabled,
    staleTime: 15_000,
  });
}

export function usePurchaseOrderSummary(
  params?: Record<string, unknown>,
  options: boolean | PurchaseOrderSummaryQueryOptions = true,
) {
  const { enabled, placeholderData, staleTime } =
    typeof options === 'boolean' ? { enabled: options } : { enabled: true, staleTime: 45_000, ...options };
  return useQuery<PurchaseOrderSummary>({
    queryKey: ['purchaseOrderSummary', params],
    queryFn: async () => {
      const { data } = await getOrderSummary(params);
      return data;
    },
    enabled: enabled !== false,
    placeholderData,
    staleTime,
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

export function usePurchaseOrderSurface(id: number | null) {
  return useQuery({
    queryKey: ['purchaseOrderSurface', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getOrderDetailSurface(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useProcessingStats(orderId: number | null) {
  return useQuery({
    queryKey: ['purchaseOrderProcessingStats', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getOrderProcessingStats(orderId);
      return data;
    },
    enabled: orderId != null,
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrderSummary'] });
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrderSummary'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrderSurface', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrderProcessingStats', variables.id] });
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrderSummary'] });
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
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['purchaseOrderSurface', variables.orderId], data);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
    },
  });
}

export function useRemoveManifest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await removeManifest(orderId);
      return data;
    },
    onSuccess: (data, orderId) => {
      queryClient.setQueryData(['purchaseOrderSurface', orderId], data);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
    },
  });
}

export function useIntakeUndoPreview(orderId: number | null, stage: IntakeUndoStage | null) {
  return useQuery({
    queryKey: ['intakeUndoPreview', orderId, stage],
    queryFn: async () => {
      const { data } = await getUndoPreview(orderId!, stage!);
      return data;
    },
    enabled: orderId != null && stage != null,
  });
}

export function useIntakeUndo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      to_stage,
    }: {
      orderId: number;
      to_stage: IntakeUndoStage;
    }) => {
      const { data } = await postIntakeUndo(orderId, { to_stage });
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['purchaseOrderSurface', variables.orderId], data);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingQueue'] });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingQueue'] });
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
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', orderId] });
      queryClient.invalidateQueries({ queryKey: ['manualReview', orderId] });
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
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
    },
  });
}

export function useFinalizePreprocessing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId }: { orderId: number }) => {
      const { data } = await finalizePreprocessing(orderId);
      return data;
    },
    onSuccess: (_data, variables) => {
      const orderId = variables.orderId;
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
      queryClient.invalidateQueries({ queryKey: ['manualReview', orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', orderId] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batchGroups'] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingQueue'] });
      queryClient.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
    },
  });
}

export function useCleanupModels(orderId: number | null | undefined) {
  return useQuery({
    queryKey: ['cleanupModels', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getCleanupModels(orderId);
      return data;
    },
    enabled: !!orderId,
  });
}

export function useAddCleanupModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, model }: { orderId: number; model: CleanupModelOption }) => {
      const { data } = await addCleanupModel(orderId, model);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cleanupModels', variables.orderId] });
    },
  });
}

export function useSetDefaultCleanupModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, modelId }: { orderId: number; modelId: string }) => {
      const { data } = await setDefaultCleanupModel(orderId, modelId);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cleanupModels', variables.orderId] });
    },
  });
}

export function useVerifyCleanupModel() {
  return useMutation({
    mutationFn: async ({ orderId, modelId }: { orderId: number; modelId: string }) => {
      const { data } = await verifyCleanupModel(orderId, modelId);
      return data;
    },
  });
}

export function useDownloadCleanupCsv() {
  return useMutation({
    mutationFn: async (orderId: number) => {
      const { data } = await downloadCleanupCsv(orderId);
      return data;
    },
  });
}

export function useUploadCleanupCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, file }: { orderId: number; file: File }) => {
      const { data } = await uploadCleanupCsv(orderId, file);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['manualReview', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', variables.orderId] });
    },
  });
}

export function useUploadCleanupCsvRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      rows,
      partial,
    }: {
      orderId: number;
      rows: import('../api/inventory.api').CleanupCsvApplyRowPayload[];
      partial?: boolean;
    }) => {
      const { data } = await uploadCleanupCsvRows(orderId, rows, { partial });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', variables.orderId] });
    },
  });
}

export const manifestFieldsQueryKey = ['inventory', 'manifest-fields'] as const;

export function useManifestFields(enabled = true) {
  return useQuery({
    queryKey: manifestFieldsQueryKey,
    queryFn: async () => {
      const { data } = await getManifestFieldMetadata();
      return data;
    },
    enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24 * 30,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

export function usePreprocessingStatus(orderId: number | null | undefined) {
  return useQuery({
    queryKey: ['preprocessingStatus', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getPreprocessingStatus(orderId);
      if (import.meta.env.DEV) {
        const ms = data.order?.manifest_sample;
        prepS1('react-query preprocessing-status fetched', {
          orderId,
          has_manifest_file: data.order?.has_manifest_file,
          manifest_sample_null: ms == null,
          headers_len: ms?.headers?.length ?? 0,
          rows_len: ms?.rows?.length ?? 0,
          template_mappings_len: (data.order?.template_column_mappings_cache ?? []).length,
          matching_templates_len: data.matching_templates?.length ?? 0,
          header_sample: (ms?.headers ?? []).slice(0, 8),
        });
      }
      return data;
    },
    enabled: !!orderId,
  });
}

export function useManualReview(
  orderId: number | null | undefined,
  params?: ManualReviewParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ['manualReview', orderId, params],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getManualReview(orderId, params);
      return data;
    },
    enabled: !!orderId && enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePreprocessingReview(
  orderId: number | null | undefined,
  params?: PreprocessingReviewParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ['preprocessingReview', orderId, params],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await getPreprocessingReview(orderId, params);
      return data;
    },
    enabled: !!orderId && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateManualReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, rows }: { orderId: number; rows: ManualReviewRowUpdate[] }) => {
      const { data } = await updateManualReview(orderId, rows);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['manualReview', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
    },
  });
}

export function useUpdatePreprocessingReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, rows }: { orderId: number; rows: PreprocessingReviewRowUpdate[] }) => {
      const { data } = await updatePreprocessingReview(orderId, rows);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', variables.orderId] });
    },
  });
}

export function useUpdatePreprocessingMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      rowId,
      finalMatchedProduct,
      decision,
    }: {
      orderId: number;
      rowId: number;
      finalMatchedProduct: number | null;
      /** 'unset' removes the match decision entirely (back to undecided). */
      decision?: 'unset';
    }) => {
      const { data } = await updatePreprocessingReview(orderId, [
        decision === 'unset'
          ? { id: rowId, final_matched_product: null, match_source: '' }
          : { id: rowId, final_matched_product: finalMatchedProduct },
      ]);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', variables.orderId] });
    },
  });
}


export function useResetPreprocessingReviewFinal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: number;
      payload: PreprocessingReviewResetFinalPayload;
    }) => {
      const { data } = await resetPreprocessingReviewFinal(orderId, payload);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preprocessingReview', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', variables.orderId] });
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

export function useItems(
  params?: Record<string, unknown>,
  options: boolean | ItemsQueryOptions = true,
) {
  const { enabled, placeholderData, staleTime } =
    typeof options === 'boolean' ? { enabled: options } : { enabled: true, ...options };
  return useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await getItems(params);
      return data;
    },
    enabled: enabled !== false,
    placeholderData,
    staleTime,
  });
}

/** Fetch all item pages (page_size 200) for a PO or filter — used where the UI needs the full in-memory queue. */
export function useItemsAllPages(
  params: Record<string, unknown> | undefined,
  enabled = true,
) {
  return useQuery<{ results: Item[]; count: number }>({
    queryKey: ['items', 'all-pages', params],
    queryFn: async () => {
      const pageSize = 200;
      let page = 1;
      const all: Item[] = [];
      let total = 0;
      for (;;) {
        const { data } = await getItems({ ...params, page, page_size: pageSize });
        const batch = data.results ?? [];
        all.push(...batch);
        total = data.count ?? all.length;
        if (all.length >= total || batch.length === 0) break;
        page += 1;
      }
      return { results: all, count: total };
    },
    enabled: Boolean(enabled && params),
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
      data: {
        unit_price?: number | string;
        unit_cost?: number | string;
        condition?: string;
        location?: string;
        check_in_count?: number;
        scrap_count?: number;
      };
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

export function useMarkItemBroken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markItemBroken(id).then(({ data }) => data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useUncheckInItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => uncheckInItem(id).then(({ data }) => data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useBulkMarkBroken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemIds }: { orderId: number; itemIds: number[] }) =>
      bulkMarkBroken(orderId, itemIds).then(({ data }) => data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useBulkUncheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemIds }: { orderId: number; itemIds: number[] }) =>
      bulkUncheckIn(orderId, itemIds).then(({ data }) => data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
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

export function useItemStats(params: {
  productId?: number | null;
  category?: string | null;
  enabled?: boolean;
}) {
  const { productId, category, enabled = true } = params;
  return useQuery({
    queryKey: ['items', 'stats', productId ?? null, category ?? ''],
    queryFn: async () => {
      const { data } = await getItemStats({
        product_id: productId ?? undefined,
        category: category ?? undefined,
      });
      return data;
    },
    enabled,
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

export function useAISuggestItem() {
  return useMutation({
    mutationFn: async (data: SuggestItemRequest) => {
      const { data: result } = await suggestItem(data);
      if (result.debug) {
        devLog.group('[suggest_item] prompt sent to AI');
        devLog.log('model:', result.debug.model);
        devLog.log('system_prompt:\n', result.debug.system_prompt);
        devLog.log('user_message:\n', result.debug.user_message);
        devLog.groupEnd();
      }
      return result;
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
