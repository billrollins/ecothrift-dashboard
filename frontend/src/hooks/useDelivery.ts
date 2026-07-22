import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveDelivery,
  archiveDeliveryDay,
  assignDeliveryDay,
  createDelivery,
  createDeliveryDay,
  getDelivery,
  getDeliveryDay,
  getDeliveryDays,
  restoreDelivery,
  searchDeliveries,
  updateDelivery,
  updateDeliveryDay,
} from '../api/pos.api';
import type { DeliveryDayDetail, DeliveryDaySummary, DeliveryJob } from '../types/pos.types';
import type { PaginatedResponse } from '../types/index';

function invalidateDeliveryDomain(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['delivery-days'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-day'] });
  queryClient.invalidateQueries({ queryKey: ['deliveries'] });
  queryClient.invalidateQueries({ queryKey: ['delivery'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-day-run'] });
}

export function useDeliveryDays(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['delivery-days', params],
    queryFn: async () => {
      const { data } = await getDeliveryDays(params);
      return data as PaginatedResponse<DeliveryDaySummary>;
    },
  });
}

export function useDeliveryDay(id: number | undefined) {
  return useQuery({
    queryKey: ['delivery-day', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await getDeliveryDay(id!);
      return data as DeliveryDayDetail;
    },
  });
}

export function useDeliveriesSearch(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['deliveries', params],
    queryFn: async () => {
      const { data } = await searchDeliveries(params);
      return data as PaginatedResponse<DeliveryJob>;
    },
  });
}

export function useDeliveryDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['delivery', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await getDelivery(id!);
      return data;
    },
  });
}

export function useDeliveryDayMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await createDeliveryDay(body);
      return data;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: updated } = await updateDeliveryDay(id, data);
      return updated;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const archive = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      await archiveDeliveryDay(id, reason);
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  return { create, update, archive };
}

export function useDeliveryMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await createDelivery(body);
      return data;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: updated } = await updateDelivery(id, data);
      return updated;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const archive = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      await archiveDelivery(id, reason);
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const restore = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const { data } = await restoreDelivery(id, reason);
      return data;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  const assignDay = useMutation({
    mutationFn: async ({
      id,
      dayId,
      reason,
    }: {
      id: number;
      dayId: number;
      reason?: string;
    }) => {
      const { data } = await assignDeliveryDay(id, dayId, reason);
      return data;
    },
    onSuccess: () => invalidateDeliveryDomain(queryClient),
  });
  return { create, update, archive, restore, assignDay };
}
