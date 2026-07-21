import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  getRegisters,
  getDrawers,
  getCarts,
  openDrawer,
  closeDrawer,
  reopenDrawer,
  drawerHandoff,
  drawerTakeover,
  createCart,
  addItemToCart,
  addManualLineToCart,
  addDiscountToCart,
  addDeliveryToCart,
  addResaleCopyToCart,
  updateCartLine,
  removeCartLine,
  completeCart,
  voidCart,
  createRegister,
  updateRegister,
  deleteRegister,
  getSupplemental,
  bootstrapSupplemental,
  getDeliveryAvailabilities,
  createDeliveryAvailability,
  updateDeliveryAvailability,
  deleteDeliveryAvailability,
  getDeliveryJobs,
  createDeliveryJob,
  updateDeliveryJob,
  getDeliveryRun,
  startDeliveryRun,
  setDeliveryRunPhase,
  markDeliveryStopContactPresent,
  markDeliveryStopDelivered,
  markDeliveryRunReturnedToStore,
  reconcileDeliveryStopReturn,
  beginDeliveryRoute,
  optimizeDeliveryRun,
  reorderDeliveryRun,
  finishDeliveryRun,
  uploadDeliveryAttachment,
  deleteDeliveryAttachment,
  markDeliveryStopLoaded,
  markDeliveryStopSecured,
  addDeliveryStopCall,
  holdDeliveryStop,
  releaseDeliveryStop,
  completeDeliveryStop,
  updateDeliveryStopNotes,
  scanVerifyDeliveryStop,
  appendDeliveryJobAddress,
  reportDeliveryStopIssue,
  rescheduleDeliveryJob,
  type Cart,
  type DeliveryAvailability,
  type DeliveryJob,
  type DeliveryRun,
} from '../api/pos.api';
import type { PaginatedResponse } from '../types/common.types';

type CartsQueryOptions = Pick<
  UseQueryOptions<PaginatedResponse<Cart>>,
  'enabled' | 'placeholderData' | 'staleTime'
>;

export function useRegisters(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['registers', params],
    queryFn: async () => {
      const { data } = await getRegisters(params);
      return data;
    },
  });
}

export function useDrawers(
  params?: Record<string, unknown>,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['drawers', params],
    queryFn: async () => {
      const { data } = await getDrawers(params);
      return data;
    },
    enabled: options?.enabled !== false,
  });
}

export function useCarts(
  params?: Record<string, unknown>,
  options?: CartsQueryOptions,
) {
  return useQuery<PaginatedResponse<Cart>>({
    queryKey: ['carts', params],
    queryFn: async () => {
      const { data } = await getCarts(params);
      return data;
    },
    enabled: options?.enabled !== false,
    placeholderData: options?.placeholderData,
    staleTime: options?.staleTime,
  });
}

export function useOpenDrawer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await openDrawer(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}

export function useCloseDrawer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await closeDrawer(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}

export function useReopenDrawer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      cashier,
    }: {
      id: number;
      cashier?: number;
    }) => {
      const { data: result } = await reopenDrawer(id, cashier ? { cashier } : undefined);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}

export function useDrawerHandoff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await drawerHandoff(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}

export function useDrawerTakeover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data?: Record<string, unknown>;
    }) => {
      const { data: result } = await drawerTakeover(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}

export function useCreateCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createCart(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useAddItemToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      sku,
    }: {
      cartId: number;
      sku: string;
    }) => {
      const { data } = await addItemToCart(cartId, sku);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useAddManualLineToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      description,
      unit_price,
      quantity,
    }: {
      cartId: number;
      description: string;
      unit_price?: number | string;
      quantity?: number;
    }) => {
      const { data } = await addManualLineToCart(cartId, {
        description,
        ...(unit_price !== undefined ? { unit_price } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useAddDiscountToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      amount,
      reason,
      target_line_id,
    }: {
      cartId: number;
      amount: number | string;
      reason?: string;
      target_line_id?: number | null;
    }) => {
      const { data } = await addDiscountToCart(cartId, {
        amount,
        ...(reason !== undefined ? { reason } : {}),
        ...(target_line_id != null ? { target_line_id } : {}),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useAddDeliveryToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      tier,
      customer_name,
      phone,
      address,
      items_delivered,
      availability_id,
      schedule_later,
      notes,
      is_apt,
      unit,
      item_count,
      cart_line_ids,
      replace_line_id,
      distance_miles,
      distance_mode,
      lat,
      lon,
      display_name,
    }: {
      cartId: number;
      tier: '5mi' | '10mi';
      customer_name: string;
      phone: string;
      address: string;
      items_delivered: string;
      availability_id?: number | null;
      schedule_later?: boolean;
      notes?: string;
      is_apt?: boolean;
      unit?: string;
      item_count?: number;
      cart_line_ids?: number[];
      replace_line_id?: number;
      distance_miles?: string | number;
      distance_mode?: string;
      lat?: number;
      lon?: number;
      display_name?: string;
    }) => {
      const { data } = await addDeliveryToCart(cartId, {
        tier,
        customer_name,
        phone,
        address,
        items_delivered,
        availability_id,
        schedule_later,
        notes,
        is_apt,
        unit,
        item_count,
        cart_line_ids,
        replace_line_id,
        distance_miles,
        distance_mode,
        lat,
        lon,
        display_name,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
    },
  });
}

export function useDeliveryAvailabilities(
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<DeliveryAvailability[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ['delivery-availabilities', params],
    queryFn: async () => {
      const { data } = await getDeliveryAvailabilities(params);
      return Array.isArray(data) ? data : [];
    },
    ...options,
  });
}

export function useCreateDeliveryAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: Partial<DeliveryAvailability> & {
        date: string;
        time_start: string;
        time_end: string;
      },
    ) => {
      const { data } = await createDeliveryAvailability(body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
    },
  });
}

export function useUpdateDeliveryAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Partial<DeliveryAvailability>;
    }) => {
      const { data: updated } = await updateDeliveryAvailability(id, data);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
    },
  });
}

export function useDeleteDeliveryAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteDeliveryAvailability(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
    },
  });
}

export function useDeliveryJobs(
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<DeliveryJob[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ['delivery-jobs', params],
    queryFn: async () => {
      const { data } = await getDeliveryJobs(params);
      return Array.isArray(data) ? data : [];
    },
    ...options,
  });
}

export function useUpdateDeliveryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: {
        status?: string;
        notes?: string;
        availability?: number;
        availability_id?: number;
        customer_name?: string;
        phone?: string;
      };
    }) => {
      const { data: updated } = await updateDeliveryJob(id, data);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
    },
  });
}

export function useCreateDeliveryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      customer_name: string;
      phone: string;
      address: string;
      items_delivered: string;
      is_apt?: boolean;
      unit?: string;
      notes?: string;
      tier?: string;
      fee?: string | number;
      availability_id?: number;
      schedule_later?: boolean;
      cart_id?: number;
      cart_line_ids?: number[];
      item_count?: number;
      distance_miles?: string | number;
      distance_mode?: string;
    }) => {
      const { data: created } = await createDeliveryJob(data);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
    },
  });
}

function invalidateDeliveryRun(queryClient: ReturnType<typeof useQueryClient>, run?: DeliveryRun) {
  queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
  queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
  if (run?.id) {
    queryClient.setQueryData(['delivery-run', run.date], run);
  }
}

export function useDeliveryRun(date: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['delivery-run', date],
    queryFn: async () => {
      if (!date) return null;
      const { data } = await getDeliveryRun(date);
      if (!data || typeof data !== 'object' || !('id' in data)) return null;
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
        return_issue_codes: Array.isArray(data.return_issue_codes)
          ? data.return_issue_codes
          : [],
        next_action: data.next_action ?? null,
        allowed_actions: Array.isArray(data.allowed_actions) ? data.allowed_actions : [],
        events: Array.isArray(data.events) ? data.events : [],
      } as DeliveryRun;
    },
    enabled: Boolean(date) && (options?.enabled ?? true),
    refetchInterval: (q) => {
      const run = q.state.data;
      if (run && run.status !== 'completed') return 15000;
      return false;
    },
  });
}

export function useStartDeliveryRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { date: string; availability_id?: number | null }) => {
      const { data } = await startDeliveryRun(body);
      return data;
    },
    onSuccess: (run) => invalidateDeliveryRun(queryClient, run),
  });
}

export function useDeliveryRunActions() {
  const queryClient = useQueryClient();
  const onRun = (run: DeliveryRun) => invalidateDeliveryRun(queryClient, run);

  const setPhase = useMutation({
    mutationFn: async ({ id, phase }: { id: number; phase: string }) => {
      const { data } = await setDeliveryRunPhase(id, phase);
      return data;
    },
    onSuccess: onRun,
  });
  const beginRoute = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await beginDeliveryRoute(id);
      return data;
    },
    onSuccess: onRun,
  });
  const optimize = useMutation({
    mutationFn: async ({ id, optimize: doOpt }: { id: number; optimize?: boolean }) => {
      const { data } = await optimizeDeliveryRun(id, doOpt ?? true);
      return data;
    },
    onSuccess: onRun,
  });
  const reorder = useMutation({
    mutationFn: async ({ id, stop_ids }: { id: number; stop_ids: number[] }) => {
      const { data } = await reorderDeliveryRun(id, stop_ids);
      return data;
    },
    onSuccess: onRun,
  });
  const finish = useMutation({
    mutationFn: async ({
      id,
      force,
      reason,
    }: {
      id: number;
      force?: boolean;
      reason?: string;
    }) => {
      const { data } = await finishDeliveryRun(id, { force, reason });
      return data;
    },
    onSuccess: onRun,
  });
  const upload = useMutation({
    mutationFn: async ({ runId, form }: { runId: number; form: FormData }) => {
      const { data } = await uploadDeliveryAttachment(runId, form);
      return data;
    },
    onSuccess: onRun,
  });
  const deleteAttachment = useMutation({
    mutationFn: async ({ runId, attachmentId }: { runId: number; attachmentId: number }) => {
      const { data } = await deleteDeliveryAttachment(runId, attachmentId);
      return data;
    },
    onSuccess: onRun,
  });
  const markLoaded = useMutation({
    mutationFn: async ({ stopId, loaded }: { stopId: number; loaded?: boolean }) => {
      const { data } = await markDeliveryStopLoaded(stopId, loaded ?? true);
      return data;
    },
    onSuccess: onRun,
  });
  const markSecured = useMutation({
    mutationFn: async ({ stopId, secured }: { stopId: number; secured?: boolean }) => {
      const { data } = await markDeliveryStopSecured(stopId, secured ?? true);
      return data;
    },
    onSuccess: onRun,
  });
  const addCall = useMutation({
    mutationFn: async ({
      stopId,
      result,
      note,
    }: {
      stopId: number;
      result: string;
      note?: string;
    }) => {
      const { data } = await addDeliveryStopCall(stopId, { result, note });
      return data;
    },
    onSuccess: onRun,
  });
  const hold = useMutation({
    mutationFn: async ({ stopId, reason }: { stopId: number; reason?: string }) => {
      const { data } = await holdDeliveryStop(stopId, reason);
      return data;
    },
    onSuccess: onRun,
  });
  const release = useMutation({
    mutationFn: async (stopId: number) => {
      const { data } = await releaseDeliveryStop(stopId);
      return data;
    },
    onSuccess: onRun,
  });
  const complete = useMutation({
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
      return data;
    },
    onSuccess: onRun,
  });
  const contactPresent = useMutation({
    mutationFn: async ({ stopId, present }: { stopId: number; present?: boolean }) => {
      const { data } = await markDeliveryStopContactPresent(stopId, present ?? true);
      return data;
    },
    onSuccess: onRun,
  });
  const markDelivered = useMutation({
    mutationFn: async ({ stopId, delivered }: { stopId: number; delivered?: boolean }) => {
      const { data } = await markDeliveryStopDelivered(stopId, delivered ?? true);
      return data;
    },
    onSuccess: onRun,
  });
  const returnToStore = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await markDeliveryRunReturnedToStore(id);
      return data;
    },
    onSuccess: onRun,
  });
  const returnReconcile = useMutation({
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
      return data;
    },
    onSuccess: onRun,
  });
  const notes = useMutation({
    mutationFn: async ({ stopId, notes: text }: { stopId: number; notes: string }) => {
      const { data } = await updateDeliveryStopNotes(stopId, text);
      return data;
    },
    onSuccess: onRun,
  });
  const scanVerify = useMutation({
    mutationFn: async ({ stopId, sku }: { stopId: number; sku: string }) => {
      const { data } = await scanVerifyDeliveryStop(stopId, sku);
      return data;
    },
    onSuccess: onRun,
  });
  const appendAddress = useMutation({
    mutationFn: async ({
      jobId,
      address,
      is_apt,
      unit,
      reason,
    }: {
      jobId: number;
      address: string;
      is_apt?: boolean;
      unit?: string;
      reason?: string;
    }) => {
      const { data } = await appendDeliveryJobAddress(jobId, {
        address,
        is_apt,
        unit,
        reason,
      });
      return data;
    },
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'id' in data) {
        onRun(data as DeliveryRun);
      } else {
        queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
        queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      }
    },
  });
  const reportIssue = useMutation({
    mutationFn: async ({
      stopId,
      issue_code,
      note,
      hold: doHold,
    }: {
      stopId: number;
      issue_code: string;
      note: string;
      hold?: boolean;
    }) => {
      const { data } = await reportDeliveryStopIssue(stopId, {
        issue_code,
        note,
        ...(doHold === undefined ? {} : { hold: doHold }),
      });
      return data;
    },
    onSuccess: onRun,
  });
  const reschedule = useMutation({
    mutationFn: async ({
      jobId,
      availability_id,
      notes: text,
    }: {
      jobId: number;
      availability_id: number;
      notes?: string;
    }) => {
      const { data } = await rescheduleDeliveryJob(jobId, {
        availability_id,
        notes: text,
      });
      return data;
    },
    onSuccess: (payload) => {
      if (payload?.run) {
        onRun(payload.run);
      } else {
        queryClient.invalidateQueries({ queryKey: ['delivery-run'] });
        queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      }
      queryClient.invalidateQueries({ queryKey: ['delivery-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-availabilities'] });
    },
  });

  return {
    setPhase,
    beginRoute,
    optimize,
    reorder,
    finish,
    upload,
    deleteAttachment,
    markLoaded,
    markSecured,
    addCall,
    hold,
    release,
    complete,
    contactPresent,
    markDelivered,
    returnToStore,
    returnReconcile,
    notes,
    scanVerify,
    appendAddress,
    reportIssue,
    reschedule,
  };
}

export function useAddResaleCopyToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      sourceItemId,
    }: {
      cartId: number;
      sourceItemId: number;
    }) => {
      const { data } = await addResaleCopyToCart(cartId, { source_item_id: sourceItemId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useUpdateCartLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      lineId,
      data,
    }: {
      cartId: number;
      lineId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateCartLine(cartId, lineId, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useRemoveCartLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      lineId,
    }: {
      cartId: number;
      lineId: number;
    }) => {
      const { data } = await removeCartLine(cartId, lineId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useCompleteCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      data,
    }: {
      cartId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await completeCart(cartId, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useVoidCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cartId: number) => {
      const { data } = await voidCart(cartId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createRegister(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registers'] }),
  });
}

export function useUpdateRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      updateRegister(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registers'] }),
  });
}

export function useDeleteRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRegister(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registers'] }),
  });
}

export function useSupplemental() {
  return useQuery({
    queryKey: ['supplemental'],
    queryFn: async () => {
      try {
        const { data } = await getSupplemental();
        return data;
      } catch (e: unknown) {
        if (isAxiosError(e) && e.response?.status === 404) return null;
        throw e;
      }
    },
    retry: false,
  });
}

export function useBootstrapSupplemental() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locationId?: number) =>
      bootstrapSupplemental(locationId != null ? { location: locationId } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplemental'] }),
  });
}
