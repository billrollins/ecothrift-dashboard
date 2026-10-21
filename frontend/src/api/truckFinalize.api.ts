import api from './client';

export type TruckMeasure = 'manifest' | 'unfulfilled' | 'expected' | 'received' | 'missing' | 'over' | 'broken';

export interface TruckFinalizeLineDTO {
  manifest_row_id: number;
  row_number: number;
  title: string;
  pallet_code: string;
  unit_retail: string | null;
  units: Record<TruckMeasure, number>;
  retail: Record<TruckMeasure, string | null>;
}

export interface TruckAdjustmentDTO {
  id: number;
  manifest_row_id: number;
  row_number: number;
  title: string;
  units: number;
  timing: 'before_arrival' | 'after_arrival';
  refund_amount: string | null;
  note: string;
  created_by: string;
  created_at: string;
}

export interface TruckRefundDTO {
  sale_price: string | null;
  rate: number;
  deductible: number;
  claimed_retail: string | null;
  claimed_pct: number | null;
  not_refunded_retail: string | null;
  refundable_retail: string | null;
  refundable_share: number;
  amount: string | null;
}

export interface TruckTotalsDTO {
  lines: number;
  lines_without_retail: number;
  units: Record<TruckMeasure, number>;
  retail: Record<TruckMeasure, string | null>;
  added_units: number;
  added_retail: string | null;
  missing_pct: number | null;
  adjusted_refund: string | null;
}

export interface TruckFinalizeDTO {
  order: {
    id: number;
    order_number: string;
    vendor: string;
    description: string;
    status: string;
    purchase_cost: string | null;
    fees: string | null;
    shipping_cost: string | null;
    delivered_date: string | null;
    has_manifest: boolean;
  };
  finalized: {
    at: string | null;
    by: string;
    snapshot: { totals?: TruckTotalsDTO; refund?: TruckRefundDTO };
  };
  totals: TruckTotalsDTO;
  refund: TruckRefundDTO;
  pallets: { total: number; arrived: number; done: number };
  pending_units: number;
  adjustments: TruckAdjustmentDTO[];
  lines: TruckFinalizeLineDTO[];
  lines_shown: 'all' | 'problems';
}

export interface TruckAdjustmentPayload {
  row_number: number;
  units: number;
  timing: TruckAdjustmentDTO['timing'];
  refund_amount?: string;
  note?: string;
}

export function getTruckFinalize(orderId: number, allLines = false): Promise<{ data: TruckFinalizeDTO }> {
  return api.get<TruckFinalizeDTO>(`/inventory/orders/${orderId}/truck-finalize/`, {
    params: allLines ? { lines: 'all' } : undefined,
  });
}

export function addTruckAdjustment(orderId: number, body: TruckAdjustmentPayload): Promise<{ data: TruckFinalizeDTO }> {
  return api.post<TruckFinalizeDTO>(`/inventory/orders/${orderId}/truck-finalize/adjustments/`, body);
}

export function deleteTruckAdjustment(orderId: number, adjustmentId: number): Promise<{ data: TruckFinalizeDTO }> {
  return api.delete<TruckFinalizeDTO>(`/inventory/orders/${orderId}/truck-finalize/adjustments/${adjustmentId}/`);
}

export function truckFinalizeStep(orderId: number, step: 'finalize' | 'reopen'): Promise<{ data: TruckFinalizeDTO }> {
  return api.post<TruckFinalizeDTO>(`/inventory/orders/${orderId}/truck-finalize/${step}/`, {});
}
