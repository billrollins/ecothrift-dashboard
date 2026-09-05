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
  addAssemblyToCart,
  addDiscountToCart,
  listGoogleReviewUsernames,
  addDeliveryToCart,
  addResaleCopyToCart,
  setCartLineSale,
  syncCartSale,
  getSaleMode,
  setLaborDayOverride,
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
  type Cart,
  type DeliveryAvailability,
} from '../api/pos.api';
import type { SaleMode } from '../types/pos.types';
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

export function useAddAssemblyToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      quantity,
    }: {
      cartId: number;
      quantity?: number;
    }) => {
      const { data } = await addAssemblyToCart(
        cartId,
        quantity !== undefined ? { quantity } : {},
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useSetCartLineSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      lineId,
      sale,
    }: {
      cartId: number;
      lineId: number;
      sale: 'summer' | 'labor_day' | 'none';
    }) => {
      const { data } = await setCartLineSale(cartId, lineId, sale);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useSyncCartSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cartId: number) => {
      const { data } = await syncCartSale(cartId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useSaleMode() {
  return useQuery<SaleMode>({
    queryKey: ['pos', 'sale-mode'],
    queryFn: async () => {
      const { data } = await getSaleMode();
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useSetLaborDayOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (override: boolean | null) => {
      const { data } = await setLaborDayOverride(override);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos', 'sale-mode'] });
    },
  });
}

export function useAddDiscountToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cartId,
      mode,
      amount,
      percent,
      reason,
      target_line_id,
      google_review_username,
      google_review_stars,
    }: {
      cartId: number;
      mode?: 'amount' | 'percent';
      amount?: number | string;
      percent?: number | string;
      reason?: string;
      target_line_id?: number | null;
      google_review_username?: string;
      google_review_stars?: number;
    }) => {
      const { data } = await addDiscountToCart(cartId, {
        ...(mode !== undefined ? { mode } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(percent !== undefined ? { percent } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(target_line_id != null ? { target_line_id } : {}),
        ...(google_review_username !== undefined
          ? { google_review_username, google_review_stars }
          : {}),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['google-review-usernames'] });
    },
  });
}

export function useGoogleReviewUsernames(enabled: boolean) {
  return useQuery({
    queryKey: ['google-review-usernames'],
    queryFn: async () => {
      const { data } = await listGoogleReviewUsernames();
      return data.results ?? [];
    },
    enabled,
    staleTime: 30_000,
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
