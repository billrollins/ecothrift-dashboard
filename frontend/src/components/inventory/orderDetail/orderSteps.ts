/**
 * The order rules the edit view (OrderDetailPage) and the Order window (OrderCard, Dash Update #191) share:
 * which lifecycle step the dates put it on, its margin, and which step buttons are open.
 */
import type { PurchaseOrderDetailSurface } from '../../../types/inventory.types';

/** The dates drive the status: the latest of paid, shipped and delivered that is set wins. */
export function deriveLifecycleStatus(
  o: Pick<PurchaseOrderDetailSurface, 'delivered_date' | 'shipped_date' | 'paid_date'>,
): 'ordered' | 'paid' | 'shipped' | 'delivered' {
  if (o.delivered_date) return 'delivered';
  if (o.shipped_date) return 'shipped';
  if (o.paid_date) return 'paid';
  return 'ordered';
}

/** (retail - total cost) / retail, as a percent; null without a retail value. */
export function marginPct(retail: number, totalCost: number): number | null {
  if (!(retail > 0) || !(totalCost >= 0)) return null;
  return ((retail - totalCost) / retail) * 100;
}

/** The five lifecycle dates, in order. */
export const ORDER_MILESTONES = [
  { key: 'ordered_date', label: 'Ordered' },
  { key: 'paid_date', label: 'Paid' },
  { key: 'shipped_date', label: 'Shipped' },
  { key: 'expected_delivery', label: 'Expected' },
  { key: 'delivered_date', label: 'Delivered' },
] as const;

/** Which step buttons are open: Preprocessing needs a manifest; Processing and the truck need it delivered. */
export function orderStepGates(o: Pick<PurchaseOrderDetailSurface, 'has_manifest' | 'status'>) {
  return {
    preprocessing: o.has_manifest,
    receiving: o.status !== 'cancelled',
    processing: ['delivered', 'processing', 'complete'].includes(o.status),
  };
}

/** The server's words when a manifest upload fails. */
export function manifestUploadError(err: unknown): string {
  const d = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  return 'Manifest upload failed';
}
