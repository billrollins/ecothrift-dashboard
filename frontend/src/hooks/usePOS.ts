import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRegisters,
  getDrawers,
  getCarts,
  openDrawer,
  closeDrawer,
  drawerHandoff,
  createCart,
  addItemToCart,
  removeCartLine,
  completeCart,
  voidCart,
} from '../api/pos.api';

export function useRegisters(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['registers', params],
    queryFn: async () => {
      const { data } = await getRegisters(params);
      return data;
    },
  });
}

export function useDrawers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['drawers', params],
    queryFn: async () => {
      const { data } = await getDrawers(params);
      return data;
    },
  });
}

export function useCarts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['carts', params],
    queryFn: async () => {
      const { data } = await getCarts(params);
      return data;
    },
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
