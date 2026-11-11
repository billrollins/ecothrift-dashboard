import api from './client';
import type { TruckDisputesDTO } from './truckPlan.api';

/** Where the truck's claim stands: nothing to claim, to file, filed (waiting for the money), answered. */
export type TruckClaimState = 'nothing' | 'to_file' | 'filed' | 'answered';

export interface TruckClaimLineDTO {
  row_number: number;
  title: string;
  reason: string;
  units: number;
  unit_retail: string | null;
  total_retail: string | null;
  upc: string;
  pallet_id: string;
  lpn: string;
}

/** Close the truck (`apps/inventory/services/truck_close.py`, Dash Update #88). */
export interface TruckCloseDTO {
  order: { id: number; order_number: string; vendor: string; description: string; delivered: string | null };
  /** The claim as it stands when the truck is closed: the header's rule, everything not received counted. */
  numbers: TruckDisputesDTO;
  added: { units: number; retail: string | null };
  state: TruckClaimState;
  /** What the top of Processing shows before the truck is closed: only what is marked so far. */
  so_far_worth: string | null;
  /** What is still open on the truck. All zero = the work is finished. */
  working: { pending_items: number; pallets_open: number; pallets_total: number };
  claim: {
    id: number | null;
    filed: boolean;
    filed_on: string | null;
    amount_asked: string | null;
    bstock_dispute_id: string;
    answered: boolean;
    amount_back: string | null;
    back_on: string | null;
    status: string;
    status_label: string;
  };
  lines: TruckClaimLineDTO[];
  copy_text: string;
  public_url: string | null;
  due: { date: string | null; days_left: number | null };
  finalized: { at: string | null; by: string };
  warnings: string[];
}

export interface UnfiledClaimDTO {
  order_id: number;
  order_number: string;
  vendor: string;
  worth: string;
  due: string | null;
  days_left: number | null;
  /** The day to file has passed: missed, not counted down. */
  missed?: boolean;
}

export type TruckCloseStep = 'filed' | 'not-filed' | 'money-back' | 'finalize';

export function getTruckClose(orderId: number): Promise<{ data: TruckCloseDTO }> {
  return api.get<TruckCloseDTO>(`/inventory/orders/${orderId}/truck-close/`);
}

export function truckCloseStep(
  orderId: number,
  step: TruckCloseStep,
  body: Record<string, string | null> = {},
): Promise<{ data: TruckCloseDTO }> {
  return api.post<TruckCloseDTO>(`/inventory/orders/${orderId}/truck-close/${step}/`, body);
}

export function getUnfiledClaims(): Promise<{ data: { claims: UnfiledClaimDTO[] } }> {
  return api.get<{ claims: UnfiledClaimDTO[] }>('/inventory/orders/unfiled-claims/');
}
