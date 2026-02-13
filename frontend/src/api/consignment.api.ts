import type { PaginatedResponse } from '../types/index';
import type { ConsignmentAgreement, ConsignmentItem, ConsignmentPayout } from '../types/consignment.types';
import api from './client';

export type { ConsignmentAgreement, ConsignmentItem, ConsignmentPayout };

type Agreement = ConsignmentAgreement;
type Payout = ConsignmentPayout;

// Agreements CRUD
export function getAgreements(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Agreement> }> {
  return api.get<PaginatedResponse<Agreement>>('/consignment/agreements/', { params });
}

export function getAgreement(id: number): Promise<{ data: Agreement }> {
  return api.get<Agreement>(`/consignment/agreements/${id}/`);
}

export function createAgreement(data: Record<string, unknown>): Promise<{ data: Agreement }> {
  return api.post<Agreement>('/consignment/agreements/', data);
}

export function updateAgreement(id: number, data: Record<string, unknown>): Promise<{ data: Agreement }> {
  return api.patch<Agreement>(`/consignment/agreements/${id}/`, data);
}

export function deleteAgreement(id: number): Promise<{ data: void }> {
  return api.delete(`/consignment/agreements/${id}/`);
}

// Consignment items CRUD
export function getConsignmentItems(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<ConsignmentItem> }> {
  return api.get<PaginatedResponse<ConsignmentItem>>('/consignment/items/', { params });
}

export function getConsignmentItem(id: number): Promise<{ data: ConsignmentItem }> {
  return api.get<ConsignmentItem>(`/consignment/items/${id}/`);
}

export function createConsignmentItem(data: Record<string, unknown>): Promise<{ data: ConsignmentItem }> {
  return api.post<ConsignmentItem>('/consignment/items/', data);
}

export function updateConsignmentItem(id: number, data: Record<string, unknown>): Promise<{ data: ConsignmentItem }> {
  return api.patch<ConsignmentItem>(`/consignment/items/${id}/`, data);
}

export function deleteConsignmentItem(id: number): Promise<{ data: void }> {
  return api.delete(`/consignment/items/${id}/`);
}

// Payouts CRUD
export function getPayouts(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Payout> }> {
  return api.get<PaginatedResponse<Payout>>('/consignment/payouts/', { params });
}

export function getPayout(id: number): Promise<{ data: Payout }> {
  return api.get<Payout>(`/consignment/payouts/${id}/`);
}

export function createPayout(data: Record<string, unknown>): Promise<{ data: Payout }> {
  return api.post<Payout>('/consignment/payouts/', data);
}

export function updatePayout(id: number, data: Record<string, unknown>): Promise<{ data: Payout }> {
  return api.patch<Payout>(`/consignment/payouts/${id}/`, data);
}

export function deletePayout(id: number): Promise<{ data: void }> {
  return api.delete(`/consignment/payouts/${id}/`);
}

export function generatePayout(data: Record<string, unknown>): Promise<{ data: Payout }> {
  return api.post<Payout>('/consignment/payouts/generate/', data);
}

export function markPayoutPaid(id: number, data: Record<string, unknown>): Promise<{ data: Payout }> {
  return api.patch<Payout>(`/consignment/payouts/${id}/pay/`, data);
}

// My consignee endpoints
export function getMyItems(): Promise<{ data: ConsignmentItem[] }> {
  return api.get<ConsignmentItem[]>('/consignment/my/items/');
}

export function getMyPayouts(): Promise<{ data: Payout[] }> {
  return api.get<Payout[]>('/consignment/my/payouts/');
}

export function getMySummary(): Promise<{ data: unknown }> {
  return api.get('/consignment/my/summary/');
}
