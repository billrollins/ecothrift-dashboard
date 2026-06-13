import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProcessingWorkspaceDTO,
  ProcessingWorkspacePatchDTO,
  ProcessingWorkspaceRowDTO,
} from '../types/inventory.types';
import {
  buildProcessingData,
  clearProcessingData,
  getProcessingDataBuild,
  getProcessingWorkspace,
  getProcessingRowDetail,
  processingBulkDisposition,
  processingDispute,
  processingAssignSharedProduct,
  processingBreakApartRow,
  processingCollapseRows,
  processingMakeSetRow,
  processingRestartRow,
  processingUncollapseRows,
  processingPatchItem,
  processingUpdateCheckInBatch,
  processingPrintAndCheckIn,
  processingPrintMultiple,
  processingRowCheckIn,
  processingCheckInTogether,
  processingRemapCheckInBatchProduct,
  processingSetRowProduct,
  processingDeleteCheckInBatch,
  processingRowPatch,
  processingAddItem,
  runProcessingDataBuildChunk,
  type ProcessingPrintAndCheckInResponse,
  type ProcessingPrintMultipleResponse,
  type ProcessingRowCheckInResponse,
  type ProcessingCheckInTogetherResponse,
  type ProcessingAssignSharedProductResponse,
  type ProcessingTransformResponse,
  type ProcessingRestartRowResponse,
  type BuildProcessingDataResponse,
  type ClearProcessingDataResponse,
  type PrintedItemPreview,
} from '../api/inventory.api';

/** Params mirrored to ``GET …/processing-workspace`` (server filters; list is unpaginated in UI). */
export interface ProcessingWorkspaceListParams {
  limit: number;
  offset: number;
  segment: string;
  /** Single product facet from header card */
  product_id?: number;
  search: string;
  hide_checked_in: boolean;
}

/** Request every filtered row in one response (server caps apply). */
export const PROCESSING_WORKSPACE_ALL_ROWS_LIMIT = 10_000;

/** List refreshed after mutations; avoid constant refetches on shallow navigation. */
const PROCESSING_WORKSPACE_STALE_MS = 30_000;

const PROCESSING_ROW_DETAIL_STALE_MS = 120_000;

/** Merge incremental rows + progress returned from processor mutations (current page slice only). */
export function mergeProcessingWorkspacePatch(
  prev: ProcessingWorkspaceDTO,
  patch: ProcessingWorkspacePatchDTO,
): ProcessingWorkspaceDTO {
  const rowsById = new Map<number, ProcessingWorkspaceRowDTO>(
    prev.rows.map((r) => [r.processing_row_id, r]),
  );
  for (const row of patch.rows) {
    const prior = rowsById.get(row.processing_row_id);
    if (prior) rowsById.set(row.processing_row_id, { ...prior, ...row });
  }
  return {
    ...prev,
    progress: patch.progress ?? prev.progress,
    rollups: patch.rollups ?? prev.rollups,
    manifest_qty_dispositioned_total:
      patch.manifest_qty_dispositioned_total ?? prev.manifest_qty_dispositioned_total,
    rows: [...rowsById.values()].sort((a, b) => a.rowNum - b.rowNum),
  };
}

export function useProcessingWorkspace(orderId: number | null, listParams: ProcessingWorkspaceListParams | null) {
  return useQuery({
    queryKey: ['processing-workspace', orderId, listParams],
    queryFn: async () => {
      const p = listParams!;
      const { data } = await getProcessingWorkspace(orderId!, {
        limit: p.limit,
        offset: p.offset,
        segment: p.segment,
        product_id: p.product_id,
        search: p.search.trim() ? p.search.trim() : undefined,
        hide_checked_in: p.hide_checked_in,
      });
      return data;
    },
    enabled: orderId != null && listParams != null,
    staleTime: PROCESSING_WORKSPACE_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useProcessingRowDetail(orderId: number | null, processingRowId: number | null) {
  return useQuery({
    queryKey: ['processing-row-detail', orderId, processingRowId],
    queryFn: async (): Promise<ProcessingWorkspaceRowDTO> => {
      const { data } = await getProcessingRowDetail(orderId!, processingRowId!);
      return data.row;
    },
    enabled: orderId != null && processingRowId != null,
    staleTime: PROCESSING_ROW_DETAIL_STALE_MS,
    gcTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function applyWorkspacePatch(qc: ReturnType<typeof useQueryClient>, orderId: number, patch: ProcessingWorkspacePatchDTO) {
  qc.setQueriesData<ProcessingWorkspaceDTO>(
    { queryKey: ['processing-workspace', orderId] },
    (prev) => (prev ? mergeProcessingWorkspacePatch(prev, patch) : prev),
  );
}

function invalidateTouchedProcessingRowDetails(
  qc: ReturnType<typeof useQueryClient>,
  orderId: number,
  patch: ProcessingWorkspacePatchDTO,
) {
  for (const r of patch.rows) {
    void qc.invalidateQueries({
      queryKey: ['processing-row-detail', orderId, r.processing_row_id],
    });
  }
}

export function printedPreviewToLabelInputs(rows: PrintedItemPreview[]) {
  return rows.map((p) => ({
    sku: p.sku,
    title: p.title,
    price: p.price,
    brand: p.brand || undefined,
    product_number: p.product_number ?? undefined,
  }));
}

export function useProcessingPrintAndCheckIn(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: number; payload: Record<string, unknown> }) => {
      const { data } = await processingPrintAndCheckIn(itemId, payload);
      return data;
    },
    onSuccess: (data: ProcessingPrintAndCheckInResponse) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingRowCheckIn(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingRowCheckIn(orderId, payload);
      return data;
    },
    onSuccess: (data: ProcessingRowCheckInResponse) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingCheckInTogether(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingCheckInTogether(orderId, payload);
      return data;
    },
    onSuccess: (data: ProcessingCheckInTogetherResponse) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingAssignSharedProduct(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingAssignSharedProduct(orderId, payload);
      return data;
    },
    onSuccess: (data: ProcessingAssignSharedProductResponse) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
    },
  });
}

export function useProcessingCollapseRows(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingCollapseRows(orderId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
    },
  });
}

export function useProcessingUncollapseRows(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingUncollapseRows(orderId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
    },
  });
}

/** P9 transforms — Break apart / Make set create or rewrite rows, so refetch the list. */
function applyTransformResult(
  qc: ReturnType<typeof useQueryClient>,
  orderId: number,
  data: ProcessingTransformResponse,
) {
  applyWorkspacePatch(qc, orderId, data.workspace_patch);
  const rowId = data.row?.processing_row_id;
  if (rowId != null) {
    qc.setQueryData(['processing-row-detail', orderId, rowId], data.row);
  }
  invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
  qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
  qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
}

export function useProcessingBreakApartRow(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingBreakApartRow(orderId, payload);
      return data;
    },
    onSuccess: (data) => applyTransformResult(qc, orderId, data),
  });
}

export function useProcessingMakeSetRow(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingMakeSetRow(orderId, payload);
      return data;
    },
    onSuccess: (data) => applyTransformResult(qc, orderId, data),
  });
}

export function useProcessingRestartRow(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { processing_row_id: number; confirm?: boolean }) => {
      const { data } = await processingRestartRow(orderId, payload);
      return data;
    },
    onSuccess: (data: ProcessingRestartRowResponse) => {
      if (!data.restarted) return; // confirm-preview: no cache changes
      if (data.workspace_patch) {
        applyWorkspacePatch(qc, orderId, data.workspace_patch);
        invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      }
      for (const deletedId of data.deleted_processing_row_ids ?? []) {
        qc.removeQueries({ queryKey: ['processing-row-detail', orderId, deletedId] });
      }
      // Sub rows were deleted — the merge-only patch can't remove them from the list.
      qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useRemapCheckInBatchProduct(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batchId, payload }: { batchId: number; payload: Record<string, unknown> }) => {
      const { data } = await processingRemapCheckInBatchProduct(orderId, batchId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      const rowId = data.row?.processing_row_id;
      if (rowId != null) {
        qc.setQueryData(['processing-row-detail', orderId, rowId], data.row);
      }
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

function applyRowProductMutationResult(
  qc: ReturnType<typeof useQueryClient>,
  orderId: number,
  data: { row?: ProcessingWorkspaceRowDTO; workspace_patch: ProcessingWorkspacePatchDTO },
) {
  applyWorkspacePatch(qc, orderId, data.workspace_patch);
  const rowId = data.row?.processing_row_id;
  if (rowId != null) {
    qc.setQueryData(['processing-row-detail', orderId, rowId], data.row);
  }
  invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
  qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
  qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
  qc.invalidateQueries({ queryKey: ['items'] });
}

export function useProcessingSetRowProduct(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingSetRowProduct(orderId, payload);
      return data;
    },
    onSuccess: (data) => applyRowProductMutationResult(qc, orderId, data),
  });
}

export function useProcessingUpdateCheckInBatch(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batchId, payload }: { batchId: number; payload: Record<string, unknown> }) => {
      const { data } = await processingUpdateCheckInBatch(orderId, batchId, payload);
      return data;
    },
    onSuccess: (data) => applyRowProductMutationResult(qc, orderId, data),
  });
}

export function useProcessingDeleteCheckInBatch(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: number) => {
      const { data } = await processingDeleteCheckInBatch(orderId, batchId);
      return data;
    },
    onSuccess: (data) => applyRowProductMutationResult(qc, orderId, data),
  });
}

export function useProcessingAddItem(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingAddItem(orderId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      const rowId = data.row?.processing_row_id;
      if (rowId != null) {
        qc.setQueryData(['processing-row-detail', orderId, rowId], data.row);
      }
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingRowPatch(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingRowPatch(orderId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      const rowId = data.row?.processing_row_id;
      if (rowId != null) {
        qc.setQueryData(['processing-row-detail', orderId, rowId], data.row);
      }
    },
  });
}

export function useProcessingPrintMultiple(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingPrintMultiple(orderId, payload);
      return data;
    },
    onSuccess: (data: ProcessingPrintMultipleResponse) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingDispute(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingDispute(orderId, payload);
      return data.workspace_patch;
    },
    onSuccess: (patch) => {
      applyWorkspacePatch(qc, orderId, patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingBulkDisposition(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingBulkDisposition(orderId, payload);
      return data.workspace_patch;
    },
    onSuccess: (patch) => {
      applyWorkspacePatch(qc, orderId, patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, patch);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingPatchItem(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: number; payload: Record<string, unknown> }) => {
      const { data } = await processingPatchItem(itemId, payload);
      return data;
    },
    onSuccess: (data) => {
      applyWorkspacePatch(qc, orderId, data.workspace_patch);
      invalidateTouchedProcessingRowDetails(qc, orderId, data.workspace_patch);
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingDataBuildStatus(orderId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['processing-data-build', orderId],
    queryFn: async (): Promise<BuildProcessingDataResponse> => {
      const { data } = await getProcessingDataBuild(orderId!);
      return data;
    },
    enabled: orderId != null && orderId > 0 && enabled,
    staleTime: 0,
    refetchInterval: (q) => {
      const row = q.state.data;
      if (!row) return false;
      if (row.status === 'none' || row.done || row.blocked) return false;
      return 1800;
    },
  });
}

export function useClearProcessingData(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ClearProcessingDataResponse> => {
      const { data } = await clearProcessingData(orderId);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
      qc.invalidateQueries({ queryKey: ['processing-row-detail', orderId] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['batchGroups'] });
      qc.invalidateQueries({ queryKey: ['processing-data-build', orderId] });
    },
  });
}

export function useBuildProcessingData(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { reset?: boolean } = {}) => {
      const reset = Boolean(opts.reset);
      let { data } = await buildProcessingData(orderId, { reset });
      let guard = 0;
      while (!data.done && !data.blocked && guard < 10_000) {
        ({ data } = await runProcessingDataBuildChunk(orderId));
        guard += 1;
      }
      if (!data.done && !data.blocked) {
        throw new Error(`Processing-data build stalled after ${guard} chunk requests.`);
      }
      return data;
    },
    onSuccess: (_data: BuildProcessingDataResponse) => {
      qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
      qc.invalidateQueries({ queryKey: ['processing-row-detail', orderId] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['batchGroups'] });
      qc.invalidateQueries({ queryKey: ['processing-data-build', orderId] });
    },
  });
}
