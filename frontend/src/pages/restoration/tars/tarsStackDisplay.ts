import type { RestorationJobDTO } from '../../../types/inventory.types';

/** Primary SKU label for a restoration stack (single item or `ITM123 +4`). */
export function stackSkuSummary(job: Pick<RestorationJobDTO, 'sku' | 'quantity' | 'items'>): string {
  const items = job.items ?? [];
  const stackSize = Math.max(job.quantity, items.length);
  const firstSku = items[0]?.sku ?? job.sku ?? '—';
  if (stackSize <= 1) return firstSku;
  return `${firstSku} +${stackSize - 1}`;
}
