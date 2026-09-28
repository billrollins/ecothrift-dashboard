import type { Cart } from '../types/pos.types';
import api from './client';

/** Thrift+ at the register (Phase 3). Each call answers with the POS cart. */
export async function attachThriftCard(cartId: number, code: string): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/attach/', { cart: cartId, code });
  return data;
}

export async function detachThriftCard(cartId: number): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/detach/', { cart: cartId });
  return data;
}

export async function setThriftChoice(cartId: number, choice: 'instant' | 'bank'): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/choice/', { cart: cartId, choice });
  return data;
}

export async function spendThriftBalance(cartId: number, credit: string, bank: string): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/balance/', { cart: cartId, credit, bank });
  return data;
}

export async function reringThriftCard(cartId: number, code: string): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/rering/', { cart: cartId, code });
  return data;
}

/** The server's message for a refused Thrift+ step (card unknown, not live, 18+, over balance). */
export function thriftErrorMessage(err: unknown, fallback = 'Thrift+ could not do that.'): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/** Whether Thrift+ is live at this register (before any sale exists). */
export async function getThriftRegisterStatus(registerCode: string): Promise<{ live: boolean }> {
  const { data } = await api.get<{ live: boolean }>('/thriftplus/register/status/', { params: { register: registerCode } });
  return data;
}

export interface ThriftReturnLine {
  cart_line: number;
  cart: number;
  sku: string;
  title: string;
  paid: string;
  sold_at: string;
  deadline: string;
  photos: string[];
  ok: boolean;
  problems: string[];
}

export interface ThriftReturnLookup {
  member: { name: string; account_id: number; photo_url: string | null; banked: string; credit: string };
  lines: ThriftReturnLine[];
}

export async function lookupThriftReturns(code: string): Promise<ThriftReturnLookup> {
  const { data } = await api.get<ThriftReturnLookup>('/thriftplus/returns/lookup/', { params: { code } });
  return data;
}

export async function returnThriftItem(body: { code: string; cart_line: number; confirmed: boolean; note: string }): Promise<{ id: number; credit: string }> {
  const { data } = await api.post<{ id: number; credit: string }>('/thriftplus/returns/', body);
  return data;
}

export async function uploadThriftSalePhoto(cartLineId: number, photo: File): Promise<void> {
  const form = new FormData();
  form.append('cart_line', String(cartLineId));
  form.append('photo', photo);
  await api.post('/thriftplus/returns/photo/', form, {
    transformRequest: [
      (body, headers) => {
        if (body instanceof FormData) delete headers['Content-Type'];
        return body;
      },
    ],
  });
}

export interface ThriftReturnRecord {
  id: number;
  status: 'open' | 'done';
  member: string;
  sku: string;
  title: string;
  paid: string;
  note: string;
  created_at: string;
}

export async function fetchThriftReturns(): Promise<ThriftReturnRecord[]> {
  const { data } = await api.get<ThriftReturnRecord[]>('/thriftplus/returns/');
  return data;
}

export async function markThriftReturnDone(id: number): Promise<void> {
  await api.post(`/thriftplus/returns/${id}/done/`);
}

export interface RestrictedProductRow {
  product_id: number;
  title: string;
  reason: string;
  marked_at: string;
  marked_by: string;
}

export async function fetchRestrictedProducts(): Promise<RestrictedProductRow[]> {
  const { data } = await api.get<RestrictedProductRow[]>('/thriftplus/restricted/');
  return data;
}

export async function markRestricted(sku: string, reason: string): Promise<void> {
  await api.post('/thriftplus/restricted/', { sku, reason });
}

export async function unmarkRestricted(productId: number): Promise<void> {
  await api.delete(`/thriftplus/restricted/${productId}/`);
}

export async function refreshCart(cartId: number): Promise<Cart> {
  const { data } = await api.get<Cart>(`/pos/carts/${cartId}/`);
  return data;
}
