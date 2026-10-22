import api from './client';

export type BStockDisputeStatus = 'draft' | 'filed' | 'refunded' | 'partial' | 'denied' | 'unresolved';

export const BSTOCK_DISPUTE_STATUSES: { value: BStockDisputeStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'filed', label: 'Filed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partial', label: 'Partly refunded' },
  { value: 'denied', label: 'Denied' },
  { value: 'unresolved', label: 'Closed unresolved' },
];

export interface BStockDisputeActivityDTO {
  outside_views: number;
  outside_by_kind: Record<string, number>;
  outside_visitors: number;
  last_outside_at: string | null;
  recent: { kind: string; label: string; detail: string; staff: boolean; at: string }[];
}

export interface BStockDisputeDTO {
  id: number;
  status: BStockDisputeStatus;
  status_label: string;
  bstock_dispute_id: string;
  note: string;
  url: string;
  suggested_note: string;
  refund_expected: string | null;
  refund_received: string | null;
  filed_at: string | null;
  closed_at: string | null;
  created_at: string;
  frozen: boolean;
  totals: {
    claimed_units: number;
    claimed_retail: string | null;
    claimed_pct: number | null;
    missing_units: number;
    broken_units: number;
  };
  line_count: number;
  activity: BStockDisputeActivityDTO;
}

export interface BStockDisputePatch {
  status?: BStockDisputeStatus;
  bstock_dispute_id?: string;
  note?: string;
  refund_received?: string | null;
}

export function getBStockDisputes(orderId: number): Promise<{ data: { disputes: BStockDisputeDTO[] } }> {
  return api.get<{ disputes: BStockDisputeDTO[] }>(`/inventory/orders/${orderId}/bstock-disputes/`);
}

export function startBStockDispute(orderId: number): Promise<{ data: { disputes: BStockDisputeDTO[] } }> {
  return api.post<{ disputes: BStockDisputeDTO[] }>(`/inventory/orders/${orderId}/bstock-disputes/`, {});
}

export function updateBStockDispute(
  orderId: number,
  disputeId: number,
  body: BStockDisputePatch,
): Promise<{ data: BStockDisputeDTO }> {
  return api.patch<BStockDisputeDTO>(`/inventory/orders/${orderId}/bstock-disputes/${disputeId}/`, body);
}
