import { useQuery } from '@tanstack/react-query';
import { getProducts, getProductUsage } from '../api/inventory.api';
import { useDebouncedValue } from './useDebouncedValue';

export function useProductSearch(scope: string, search: string, enabled: boolean, pageSize = 25) {
  // Debounce so fast typists get ONE request per pause, not one per keystroke.
  const trimmed = useDebouncedValue(search.trim(), 250);
  const { data, isFetching } = useQuery({
    queryKey: ['products', scope, trimmed],
    queryFn: async () => {
      const { data: page } = await getProducts({
        search: trimmed || undefined,
        page_size: pageSize,
      });
      return page;
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return { products: data?.results ?? [], isFetching };
}

/** "Affects X items across Y orders" blast radius before editing a shared product. */
export function useProductUsage(productId: number | null | undefined) {
  const { data, isFetching } = useQuery({
    queryKey: ['product-usage', productId],
    queryFn: async () => {
      const { data: usage } = await getProductUsage(productId as number);
      return usage;
    },
    enabled: productId != null,
    staleTime: 30_000,
  });
  return { usage: data ?? null, isFetching };
}

export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
