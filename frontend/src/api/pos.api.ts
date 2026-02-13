import type { PaginatedResponse } from '../types/index';
import type { Register, Drawer } from '../types/pos.types';
import api from './client';

export type { Register, Drawer };

export interface RevenueGoal {
  id: number;
  [key: string]: unknown;
}

export interface Cart {
  id: number;
  [key: string]: unknown;
}

// Registers CRUD
export function getRegisters(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Register> }> {
  return api.get<PaginatedResponse<Register>>('/pos/registers/', { params });
}

export function getRegister(id: number): Promise<{ data: Register }> {
  return api.get<Register>(`/pos/registers/${id}/`);
}

export function createRegister(data: Record<string, unknown>): Promise<{ data: Register }> {
  return api.post<Register>('/pos/registers/', data);
}

export function updateRegister(id: number, data: Record<string, unknown>): Promise<{ data: Register }> {
  return api.patch<Register>(`/pos/registers/${id}/`, data);
}

export function deleteRegister(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/registers/${id}/`);
}

// Revenue goals CRUD
export function getRevenueGoals(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<RevenueGoal> }> {
  return api.get<PaginatedResponse<RevenueGoal>>('/pos/revenue-goals/', { params });
}

export function getRevenueGoal(id: number): Promise<{ data: RevenueGoal }> {
  return api.get<RevenueGoal>(`/pos/revenue-goals/${id}/`);
}

export function createRevenueGoal(data: Record<string, unknown>): Promise<{ data: RevenueGoal }> {
  return api.post<RevenueGoal>('/pos/revenue-goals/', data);
}

export function updateRevenueGoal(id: number, data: Record<string, unknown>): Promise<{ data: RevenueGoal }> {
  return api.patch<RevenueGoal>(`/pos/revenue-goals/${id}/`, data);
}

export function deleteRevenueGoal(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/revenue-goals/${id}/`);
}

// Drawers
export function getDrawers(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Drawer> }> {
  return api.get<PaginatedResponse<Drawer>>('/pos/drawers/', { params });
}

export function openDrawer(data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>('/pos/drawers/', data);
}

export function drawerHandoff(id: number, data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/handoff/`, data);
}

export function closeDrawer(id: number, data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/close/`, data);
}

export function cashDrop(drawerId: number, data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post(`/pos/drawers/${drawerId}/drop/`, data);
}

// Supplemental
export function getSupplemental(): Promise<{ data: unknown }> {
  return api.get('/pos/supplemental/');
}

export function drawFromSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/draw/', data);
}

export function returnToSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/return/', data);
}

export function auditSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/audit/', data);
}

export function getSupplementalTransactions(): Promise<{ data: unknown[] }> {
  return api.get('/pos/supplemental/transactions/');
}

// Bank transactions
export function getBankTransactions(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<unknown> }> {
  return api.get<PaginatedResponse<unknown>>('/pos/bank-transactions/', { params });
}

export function createBankTransaction(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/bank-transactions/', data);
}

export function completeBankTransaction(id: number): Promise<{ data: unknown }> {
  return api.patch(`/pos/bank-transactions/${id}/complete/`);
}

// Carts
export function createCart(data: Record<string, unknown>): Promise<{ data: Cart }> {
  return api.post<Cart>('/pos/carts/', data);
}

export function getCart(id: number): Promise<{ data: Cart }> {
  return api.get<Cart>(`/pos/carts/${id}/`);
}

export function addItemToCart(cartId: number, sku: string): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-item/`, { sku });
}

export function removeCartLine(cartId: number, lineId: number): Promise<{ data: unknown }> {
  return api.delete(`/pos/carts/${cartId}/lines/${lineId}/`);
}

export function completeCart(cartId: number, data: Record<string, unknown>): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/complete/`, data);
}

export function voidCart(cartId: number): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/void/`);
}

export function getCarts(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Cart> }> {
  return api.get<PaginatedResponse<Cart>>('/pos/carts/', { params });
}

// Dashboard
export function getDashboardMetrics(): Promise<{ data: unknown }> {
  return api.get('/pos/dashboard/metrics/');
}

export function getDashboardAlerts(): Promise<{ data: unknown[] }> {
  return api.get('/pos/dashboard/alerts/');
}
