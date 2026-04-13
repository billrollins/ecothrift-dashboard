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
  type Cart,
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
