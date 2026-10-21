import api from './client';

/** Manifest vs received for one pallet, a group of lines, or the truck (`services/truck_pallets.py`). */
export interface PalletAccountingDTO {
  manifest_lines: number;
  manifest_units: number;
  manifest_retail: string | null;
  lines_without_retail: number;
  received_units: number;
  received_retail: string | null;
  missing_units: number;
  missing_retail: string | null;
  missing_pct_units: number | null;
  missing_pct_retail: number | null;
  over_units: number;
  broken_units: number;
}

export type TruckPalletStatus = 'waiting' | 'processing' | 'done';

export interface TruckPalletDTO extends PalletAccountingDTO {
  id: number;
  number: number;
  code: string;
  label: string;
  from_manifest: boolean;
  status: TruckPalletStatus;
  arrived_at: string | null;
  started_at: string | null;
  started_by: string;
  done_at: string | null;
  done_by: string;
  checked_in_units: number;
  added_units: number;
  from_other_pallets_units: number;
}

export interface TruckPalletLedgerDTO {
  order_id: number;
  has_manifest_pallets: boolean;
  pallets_total: number;
  pallets_arrived: number;
  pallets_started: number;
  pallets_done: number;
  current_pallet_id: number | null;
  pallets: TruckPalletDTO[];
  unassigned: PalletAccountingDTO | null;
  truck: PalletAccountingDTO & { added_units: number; units_without_pallet: number };
  /** Missing over finished pallets only; null until one is finished or when the manifest has no pallet ids. */
  running: PalletAccountingDTO | null;
  running_basis: 'finished_pallets' | 'no_manifest_pallet_ids';
}

export type TruckPalletStep = 'start' | 'finish' | 'reopen';

export function getTruckPallets(orderId: number): Promise<{ data: TruckPalletLedgerDTO }> {
  return api.get<TruckPalletLedgerDTO>(`/inventory/orders/${orderId}/pallets/`);
}

export function recordTruckPallet(
  orderId: number,
  body: { number: number; code?: string },
): Promise<{ data: TruckPalletLedgerDTO }> {
  return api.post<TruckPalletLedgerDTO>(`/inventory/orders/${orderId}/pallets/record/`, body);
}

export function truckPalletStep(
  orderId: number,
  step: TruckPalletStep,
  body: { pallet_id?: number; code?: string },
): Promise<{ data: TruckPalletLedgerDTO }> {
  return api.post<TruckPalletLedgerDTO>(`/inventory/orders/${orderId}/pallets/${step}/`, body);
}
