import api from './client';

/**
 * Dispute a manifest row from the Processing queue (Dash Update #100): units, a reason and a note, with no product,
 * item or check-in. Server: `apps/inventory/services/row_disputes.py`, `apps/inventory/api_row_disputes.py`.
 */

export type RowDisputeReason = 'did_not_come' | 'broken' | 'wrong_item' | 'missing_parts' | 'other';

export interface RowDisputePhotoDTO {
  id: number;
  url: string | null;
  thumb_url: string | null;
}

export interface RowDisputeDTO {
  id: number;
  /** Photos of the problem (Dash Update #101): every reason but did_not_come has at least one. */
  photos: RowDisputePhotoDTO[];
  /** Set when the dispute is about one checked-in item (Dash Update #102). */
  item_id: number | null;
  item_sku: string;
  reason: RowDisputeReason;
  reason_label: string;
  units: number;
  pct_lost: number;
  note: string;
  by: string;
  at: string | null;
  undone_at: string | null;
  undone_by: string;
}

export interface RowDisputesResponse {
  row: {
    processing_row_id: number;
    row_number: number;
    title: string;
    quantity: number;
    /** Units not yet checked in or disputed. */
    remaining: number;
    unit_retail: string | null;
    /** Units disputed on this row now (undone ones not counted). */
    disputed: number;
  };
  disputes: RowDisputeDTO[];
  reasons: Array<{ value: RowDisputeReason; label: string; partial: boolean; photos: boolean }>;
  default_pct_lost: number;
  photos_max: number;
}

export interface RowDisputeInput {
  processing_row_id: number;
  /** A checked-in item on that row: the dispute is about it (units are 1). */
  item_id?: number;
  reason: RowDisputeReason;
  units: number;
  pct_lost?: number;
  note?: string;
}

export const rowDisputesKey = (orderId: number, processingRowId: number) => ['row-disputes', orderId, processingRowId] as const;

export function getRowDisputes(orderId: number, processingRowId: number) {
  return api
    .get<RowDisputesResponse>(`/inventory/orders/${orderId}/row-disputes/`, { params: { processing_row: processingRowId } })
    .then((r) => r.data);
}

/** With photos it goes as a form (``photos``, one file each); without, as JSON. */
export function createRowDispute(orderId: number, body: RowDisputeInput, photos: File[] = []) {
  const url = `/inventory/orders/${orderId}/row-disputes/`;
  if (!photos.length) {
    return api.post<RowDisputesResponse & { dispute: RowDisputeDTO }>(url, body).then((r) => r.data);
  }
  const form = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v != null) form.append(k, String(v));
  });
  photos.forEach((file) => form.append('photos', file, file.name || 'photo.jpg'));
  return api.post<RowDisputesResponse & { dispute: RowDisputeDTO }>(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
}

export function undoRowDispute(orderId: number, disputeId: number) {
  return api.post<RowDisputesResponse>(`/inventory/orders/${orderId}/row-disputes/${disputeId}/undo/`, {}).then((r) => r.data);
}
