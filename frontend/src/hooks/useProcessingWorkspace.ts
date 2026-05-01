import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProcessingWorkspaceDTO } from '../types/inventory.types';
import {
  getProcessingWorkspace,
  processingBulkDisposition,
  processingDispute,
  processingMergeRows,
  processingPatchItem,
  processingPrintAndCheckIn,
  processingPrintMultiple,
  processingSwap,
  type ProcessingPrintAndCheckInResponse,
  type ProcessingPrintMultipleResponse,
} from '../api/inventory.api';

export function useProcessingWorkspace(orderId: number | null) {
  return useQuery({
    queryKey: ['processing-workspace', orderId],
    queryFn: async () => {
      const { data } = await getProcessingWorkspace(orderId!);
      return data;
    },
    enabled: orderId != null,
  });
}

function patchWorkspaceCache(qc: ReturnType<typeof useQueryClient>, orderId: number, ws: ProcessingWorkspaceDTO) {
  qc.setQueryData<ProcessingWorkspaceDTO>(['processing-workspace', orderId], ws);
}

export function useProcessingPrintAndCheckIn(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: number; payload: Record<string, unknown> }) => {
      const { data } = await processingPrintAndCheckIn(itemId, payload);
      return data;
    },
    onSuccess: (data: ProcessingPrintAndCheckInResponse) => {
      patchWorkspaceCache(qc, orderId, data.workspace);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
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
      patchWorkspaceCache(qc, orderId, data.workspace);
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
      return data.workspace;
    },
    onSuccess: (ws) => {
      patchWorkspaceCache(qc, orderId, ws);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingMergeRows(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingMergeRows(orderId, payload);
      return data.workspace;
    },
    onSuccess: (ws) => {
      patchWorkspaceCache(qc, orderId, ws);
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useProcessingSwap(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await processingSwap(orderId, payload);
      return data.workspace;
    },
    onSuccess: (ws) => {
      patchWorkspaceCache(qc, orderId, ws);
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
      return data.workspace;
    },
    onSuccess: (ws) => {
      patchWorkspaceCache(qc, orderId, ws);
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
      patchWorkspaceCache(qc, orderId, data.workspace);
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
