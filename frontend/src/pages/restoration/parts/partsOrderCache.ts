import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';

export function orderBelongsInLiveBucket(order: RestorationPartsOrderDTO): boolean {
  if (order.status === 'requested' || order.status === 'approved' || order.status === 'purchased') {
    return true;
  }
  return order.status === 'received' && order.review_state !== 'reviewed';
}

export function orderBelongsInHistoryBucket(order: RestorationPartsOrderDTO): boolean {
  if (order.status === 'cancelled' || order.status === 'denied') return true;
  return order.status === 'received' && order.review_state === 'reviewed';
}

export function applyOrderToCachedList(
  prev: RestorationPartsOrderDTO[],
  order: RestorationPartsOrderDTO,
  filters?: { bucket?: 'live' | 'history'; job?: number },
): RestorationPartsOrderDTO[] {
  const without = prev.filter((row) => row.id !== order.id);
  if (filters?.job != null && order.job !== filters.job) return without;
  const belongs =
    filters?.bucket === 'live'
      ? orderBelongsInLiveBucket(order)
      : filters?.bucket === 'history'
        ? orderBelongsInHistoryBucket(order)
        : true;
  if (!belongs) return without;
  return [order, ...without];
}
