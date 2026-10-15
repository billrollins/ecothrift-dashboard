import type { Cart, ThriftPlusLineMark } from '../types/pos.types';
import api from './client';

/**
 * Thrift+ at the register (Phase 3; the 10-14 register build). Each call answers with the POS cart. There is no
 * Thrift+ card (owner 2026-10-14): a member shows the member QR in the Thrift+ app (`code`: `TP` + their member
 * code, read by the scan box) or gives their phone number (`findThriftMembers`, then the person's id).
 */
export async function attachThriftCard(cartId: number, code: string): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/attach/', { cart: cartId, code });
  return data;
}

/** One person on a membership the phone is on: enough to pick them by their photo. */
export interface ThriftFoundPerson {
  person_id: number;
  account_id: number;
  first_name: string;
  last_initial: string;
  role: 'primary' | 'secondary';
  photo_url: string | null;
  verified_18: boolean;
  /** A practice member: works only on the training register. */
  practice: boolean;
  /** 'active' or 'revoked'. */
  account_status: string;
}

/**
 * Find a member by phone (owner 2026-10-14): any format, matched on the digits. Every adult on each membership that
 * phone is on (2 may share one), primary first. A POST, so the number stays out of request logs.
 */
export async function findThriftMembers(phone: string): Promise<ThriftFoundPerson[]> {
  const { data } = await api.post<{ people: ThriftFoundPerson[] }>('/thriftplus/register/find/', { phone });
  return data.people;
}

/** Put the member found by phone on the sale (the same rules as their QR). */
export async function attachThriftMember(cartId: number, personId: number): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/attach/', { cart: cartId, person: personId });
  return data;
}

export async function detachThriftCard(cartId: number): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/detach/', { cart: cartId });
  return data;
}

/** Kept (the Default, 'bank') or redeemed instantly ('instant'). Refused (400) when instant isn't offered. */
export async function setThriftChoice(cartId: number, choice: 'instant' | 'bank'): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/choice/', { cart: cartId, choice });
  return data;
}

/**
 * Kept ThriftBucks on this trip (owner 10-14): used automatically after the Thrift+ credit, soonest use-by
 * first. ``use=false`` is the cashier's one tap "Don't use ThriftBucks today"; ``use=true`` turns it back on.
 * An API call, not a React hook.
 */
export async function useThriftBucks(cartId: number, use: boolean): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/bucks/', { cart: cartId, use });
  return data;
}

export async function reringThriftCard(cartId: number, code: string): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/rering/', { cart: cartId, code });
  return data;
}

/** Re-ring the last sale for the member found by phone. */
export async function reringThriftMember(cartId: number, personId: number): Promise<Cart> {
  const { data } = await api.post<Cart>('/thriftplus/register/rering/', { cart: cartId, person: personId });
  return data;
}

/** The server's message for a refused Thrift+ step (member code unknown, not live, 18+, instant not offered). */
export function thriftErrorMessage(err: unknown, fallback = 'Thrift+ could not do that.'): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/** Whether Thrift+ is live at this register (before any sale exists). */
export async function getThriftRegisterStatus(registerCode: string): Promise<{ live: boolean }> {
  const { data } = await api.get<{ live: boolean }>('/thriftplus/register/status/', { params: { register: registerCode } });
  return data;
}

/** One line the member bought, for a Thrift+ 3-day return (W1-W7). Money in dollars; ThriftBucks as numbers. */
export interface ThriftReturnLine {
  cart_line: number;
  cart: number;
  sku: string;
  title: string;
  /** The line's mark at the sale: only '3-day return' lines can come back. */
  mark?: ThriftPlusLineMark;
  /** Thrift+ credit back: 80% of what was paid, tax included. */
  refund?: string;
  /** ThriftBucks back: 80% of the ThriftBucks used on it, with a fresh 30 days. */
  bucks_back?: string;
  /** ThriftBucks taken back: 80% of the ThriftBucks it collected (the member keeps 20%). */
  bucks_take?: string;
  /** Older servers: what was paid. */
  paid?: string;
  sold_at: string;
  /** ISO date: the last day it can come back (sale day + 3). */
  deadline: string;
  photos: string[];
  ok: boolean;
  /** Why it can't come back ('' when it can). */
  problem?: string;
  /** Older servers: the reasons as a list. */
  problems?: string[];
}

export interface ThriftReturnLookup {
  member: {
    name: string;
    account_id: number;
    photo_url: string | null;
    banked?: string;
    available?: string;
    credit?: string;
  };
  lines: ThriftReturnLine[];
}

/** Who a return is for: their member QR scanned (`code`) or the person found by phone (`person`). */
export type ThriftReturnWho = { code: string } | { person: number };

export async function lookupThriftReturns(who: ThriftReturnWho | string): Promise<ThriftReturnLookup> {
  const params = typeof who === 'string' ? { code: who } : who;
  const { data } = await api.get<ThriftReturnLookup>('/thriftplus/returns/lookup/', { params });
  return data;
}

/** What a Thrift+ 3-day return gave. ``training``: the training register worked it out and wrote nothing. */
export interface ThriftReturnResult {
  id: number | null;
  /** Thrift+ credit (dollars). */
  credit: string;
  bucks_back: string;
  bucks_taken: string;
  /** ThriftBucks to take back that were already spent: the credit was cut by this much. */
  shortfall: string;
  training: boolean;
}

/** Take one line back as Thrift+ credit. ``register``: this terminal's code (the training register writes nothing). */
export async function returnThriftItem(
  body: ThriftReturnWho & { cart_line: number; note?: string; register: string },
): Promise<ThriftReturnResult> {
  const { data } = await api.post<ThriftReturnResult>('/thriftplus/returns/', body);
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
  /** The Thrift+ credit given (dollars). */
  paid: string;
  /** Newer servers: the Thrift+ credit given, when it is sent apart from ``paid``. */
  credit?: string;
  bucks_back?: string;
  bucks_taken?: string;
  shortfall?: string;
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
