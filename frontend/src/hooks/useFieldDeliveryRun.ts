import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  beginDeliveryRoute,
  closeDeliveryRunTruck,
  reopenDeliveryRunTruck,
  commitDeliveryRouteInsert,
  completeDeliveryStop,
  excludeDeliveryStopUnconfirmed,
  finishDeliveryRun,
  getDeliveryDayRun,
  holdDeliveryStop,
  markDeliveryRunReturnedToStore,
  markDeliveryStopContactPresent,
  markDeliveryStopDelivered,
  markDeliveryStopLoaded,
  optimizeDeliveryRun,
  previewDeliveryRouteInsert,
  reconcileDeliveryStopReturn,
  recordDeliveryStopContactAttempt,
  reorderDeliveryRun,
  reportDeliveryStopIssue,
  releaseDeliveryStop,
  scanDeliveryStopItem,
  setDeliveryRunDepartureOverride,
  setDeliveryRunPhase,
  setDeliveryStopDisposition,
  setDeliveryStopItemLoaded,
  setDeliveryStopItemPhotoException,
  skipDeliveryStopItemVerification,
  startDeliveryDayRun,
  uploadDeliveryAttachment,
} from '../api/pos.api';
import type { DeliveryRun } from '../types/pos.types';

function normalizeRun(data: DeliveryRun): DeliveryRun {
  return {
    ...data,
    stops: Array.isArray(data.stops) ? data.stops : [],
    truck_photos: Array.isArray(data.truck_photos) ? data.truck_photos : [],
    progress: data.progress ?? {
      total: 0,
      confirmed: 0,
      completed: 0,
      on_hold: 0,
      queued: 0,
      failed: 0,
      needs_reconcile: 0,
    },
    truck_photo_count: data.truck_photo_count ?? 0,
    max_truck_photos: data.max_truck_photos ?? 4,
    all_stops_called: data.all_stops_called ?? false,
    can_finish: data.can_finish ?? false,
    returned_to_store_at: data.returned_to_store_at ?? null,
    return_issue_codes: Array.isArray(data.return_issue_codes) ? data.return_issue_codes : [],
    next_action: data.next_action ?? null,
    allowed_actions: Array.isArray(data.allowed_actions) ? data.allowed_actions : [],
    events: Array.isArray(data.events) ? data.events : [],
    contact_dispositions: Array.isArray(data.contact_dispositions) ? data.contact_dispositions : [],
    monitor: data.monitor ?? undefined,
    truck_closed: data.truck_closed ?? false,
    all_stops_resolved: data.all_stops_resolved ?? false,
  };
}

function invalidateFieldDelivery(
  queryClient: ReturnType<typeof useQueryClient>,
  dayId?: number,
  run?: DeliveryRun,
) {
  queryClient.invalidateQueries({ queryKey: ['delivery-day'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-days'] });
  if (dayId != null) {
    queryClient.invalidateQueries({ queryKey: ['delivery-day-run', dayId] });
    if (run) {
      queryClient.setQueryData(['delivery-day-run', dayId], run);
    }
  }
  queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
}

export function useFieldDeliveryRun(dayId: number | undefined, options?: { enabled?: boolean; poll?: boolean }) {
  return useQuery<DeliveryRun | null>({
    queryKey: ['delivery-day-run', dayId],
    enabled: Boolean(dayId) && (options?.enabled ?? true),
    queryFn: async () => {
      try {
        const { data } = await getDeliveryDayRun(dayId!);
        return normalizeRun(data);
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    refetchInterval: (q) => {
      if (options?.poll === false) return false;
      const run = q.state.data;
      if (run && run.status !== 'completed') return 12000;
      return false;
    },
  });
}

export function useStartFieldDeliveryRun(dayId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!dayId) throw new Error('dayId required');
      const { data } = await startDeliveryDayRun(dayId);
      return normalizeRun(data);
    },
    onSuccess: (run) => invalidateFieldDelivery(queryClient, dayId, run),
  });
}

export function useFieldDeliveryRunMutations(dayId: number | undefined) {
  const queryClient = useQueryClient();
  const onRun = (run: DeliveryRun) => invalidateFieldDelivery(queryClient, dayId, run);

  return {
    contactAttempt: useMutation({
      mutationFn: async ({
        stopId,
        channel,
        action,
        note,
      }: {
        stopId: number;
        channel: string;
        action: string;
        note?: string;
      }) => {
        const { data } = await recordDeliveryStopContactAttempt(stopId, { channel, action, note });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    disposition: useMutation({
      mutationFn: async ({
        stopId,
        disposition,
        note,
      }: {
        stopId: number;
        disposition: string;
        note?: string;
      }) => {
        const { data } = await setDeliveryStopDisposition(stopId, { disposition, note });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    excludeUnconfirmed: useMutation({
      mutationFn: async ({
        stopId,
        reason,
        clear,
      }: {
        stopId: number;
        reason?: string;
        clear?: boolean;
      }) => {
        const { data } = await excludeDeliveryStopUnconfirmed(stopId, { reason, clear });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    scanItem: useMutation({
      mutationFn: async ({
        itemId,
        scanned_code,
        client_scan_id,
        allow_mismatch,
      }: {
        itemId: number;
        scanned_code: string;
        client_scan_id?: string;
        allow_mismatch?: boolean;
      }) => {
        const { data } = await scanDeliveryStopItem(itemId, {
          scanned_code,
          client_scan_id,
          allow_mismatch,
        });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    skipItem: useMutation({
      mutationFn: async ({ itemId, reason }: { itemId: number; reason: string }) => {
        const { data } = await skipDeliveryStopItemVerification(itemId, { reason });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    loadItem: useMutation({
      mutationFn: async ({
        itemId,
        loaded,
        reason,
      }: {
        itemId: number;
        loaded?: boolean;
        reason?: string;
      }) => {
        const { data } = await setDeliveryStopItemLoaded(
          itemId,
          loaded ?? true,
          reason || '',
        );
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    loadStop: useMutation({
      mutationFn: async ({
        stopId,
        loaded,
        reason,
      }: {
        stopId: number;
        loaded?: boolean;
        reason?: string;
      }) => {
        const { data } = await markDeliveryStopLoaded(stopId, loaded ?? true, reason || '');
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    photoException: useMutation({
      mutationFn: async ({ itemId, reason }: { itemId: number; reason: string }) => {
        const { data } = await setDeliveryStopItemPhotoException(itemId, { reason });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    closeTruck: useMutation({
      mutationFn: async (runId: number) => {
        const { data } = await closeDeliveryRunTruck(runId);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    reopenTruck: useMutation({
      mutationFn: async ({ runId, reason }: { runId: number; reason?: string }) => {
        const { data } = await reopenDeliveryRunTruck(runId, reason ? { reason } : undefined);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    departureOverride: useMutation({
      mutationFn: async ({ runId, reason }: { runId: number; reason: string }) => {
        const { data } = await setDeliveryRunDepartureOverride(runId, { reason });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    setPhase: useMutation({
      mutationFn: async ({ runId, phase }: { runId: number; phase: string }) => {
        const { data } = await setDeliveryRunPhase(runId, phase);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    beginRoute: useMutation({
      mutationFn: async (runId: number) => {
        const { data } = await beginDeliveryRoute(runId);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    optimize: useMutation({
      mutationFn: async ({
        runId,
        optimize,
        base_revision,
      }: {
        runId: number;
        optimize?: boolean;
        base_revision?: number;
      }) => {
        const { data } = await optimizeDeliveryRun(runId, optimize ?? true, base_revision);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    reorder: useMutation({
      mutationFn: async ({
        runId,
        stop_ids,
        base_revision,
      }: {
        runId: number;
        stop_ids: number[];
        base_revision?: number;
      }) => {
        const { data } = await reorderDeliveryRun(runId, stop_ids, base_revision);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    previewInsert: useMutation({
      mutationFn: async ({
        runId,
        stopId,
        base_revision,
      }: {
        runId: number;
        stopId: number;
        base_revision?: number;
      }) => {
        const { data } = await previewDeliveryRouteInsert(runId, stopId, base_revision);
        return data;
      },
    }),
    commitInsert: useMutation({
      mutationFn: async ({
        runId,
        stopId,
        base_revision,
        position,
      }: {
        runId: number;
        stopId: number;
        base_revision?: number;
        position?: number;
      }) => {
        const { data } = await commitDeliveryRouteInsert(runId, stopId, {
          baseRevision: base_revision,
          position,
        });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    upload: useMutation({
      mutationFn: async ({
        runId,
        form,
        onProgress,
      }: {
        runId: number;
        form: FormData;
        onProgress?: (fraction: number) => void;
      }) => {
        const { data } = await uploadDeliveryAttachment(runId, form, onProgress);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    contactPresent: useMutation({
      mutationFn: async ({ stopId, present }: { stopId: number; present?: boolean }) => {
        const { data } = await markDeliveryStopContactPresent(stopId, present ?? true);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    delivered: useMutation({
      mutationFn: async ({ stopId, delivered }: { stopId: number; delivered?: boolean }) => {
        const { data } = await markDeliveryStopDelivered(stopId, delivered ?? true);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    complete: useMutation({
      mutationFn: async ({
        stopId,
        override,
        override_reason,
      }: {
        stopId: number;
        override?: boolean;
        override_reason?: string;
      }) => {
        const { data } = await completeDeliveryStop(stopId, { override, override_reason });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    hold: useMutation({
      mutationFn: async ({ stopId, reason }: { stopId: number; reason?: string }) => {
        const { data } = await holdDeliveryStop(stopId, reason);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    release: useMutation({
      mutationFn: async (stopId: number) => {
        const { data } = await releaseDeliveryStop(stopId);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    reportIssue: useMutation({
      mutationFn: async ({
        stopId,
        issue_code,
        note,
        hold,
      }: {
        stopId: number;
        issue_code: string;
        note: string;
        hold?: boolean;
      }) => {
        const { data } = await reportDeliveryStopIssue(stopId, { issue_code, note, hold });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    returnToStore: useMutation({
      mutationFn: async (runId: number) => {
        const { data } = await markDeliveryRunReturnedToStore(runId);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    returnReconcile: useMutation({
      mutationFn: async ({
        stopId,
        ...body
      }: {
        stopId: number;
        unloaded?: boolean;
        items_stored?: boolean;
        issue_code?: string;
        issue_notes?: string;
        reconcile?: boolean;
      }) => {
        const { data } = await reconcileDeliveryStopReturn(stopId, body);
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
    finish: useMutation({
      mutationFn: async ({
        runId,
        force,
        reason,
      }: {
        runId: number;
        force?: boolean;
        reason?: string;
      }) => {
        const { data } = await finishDeliveryRun(runId, { force, reason });
        return normalizeRun(data);
      },
      onSuccess: onRun,
    }),
  };
}
