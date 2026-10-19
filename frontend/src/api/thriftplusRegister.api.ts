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

/**
 * Joined online and not finished yet (owner 2026-10-15, J8): a pending membership. It collects and uses nothing until
 * the register finishes joining (the phone read back, the ID, the photo).
 */
export interface ThriftPendingPerson {
  person_id: number;
  account_id: number;
  first_name: string;
  last_name: string;
  email: string;
  /** When they joined online (ISO). */
  joined_at: string;
  /** The last 4 of their member code (the QR in their app), or null. */
  code_last4: string | null;
  /** Their member QR (`TP` + code): the terminal shows it for the Finalize phone to scan (owner 2026-10-16). */
  qr?: string | null;
  /** Finalize's newest-50 list only: `active` once they finished. */
  status?: 'pending' | 'active';
  /** Finalize only (owner 2026-10-16): the card's line and the panel. */
  code_display?: string;
  phone_last4?: string | null;
  email_verified?: boolean;
  id_checked?: boolean;
  verified_18?: boolean;
  photo_url?: string | null;
  signed_at?: string | null;
  finished_at?: string | null;
  finished_by?: string;
  app_signed_in?: boolean;
  /** Join v2 (owner 2026-10-19): they took a selfie in the app (`photo_url` shows it). */
  selfie?: boolean;
  /** Join v2: they signed the terms in the app. */
  signed?: boolean;
  /** Join v2: how they joined, masked ("c***@example.com" or "••0123"). */
  contact?: string;
}

/** Pending joins by name, email or member code, newest first (at most 10). A POST, so names stay out of request logs. */
export async function findPendingJoins(q: string): Promise<ThriftPendingPerson[]> {
  const { data } = await api.post<{ people: ThriftPendingPerson[] }>('/thriftplus/register/pending/', { q });
  return data.people;
}

/** A scanned member QR that is no pending join: where that membership stands ('unknown' when no one has the code). */
export interface ThriftCodeMember {
  status: 'active' | 'revoked' | 'removed' | 'unknown' | string;
  first_name: string;
}

/**
 * Finalize Thrift+ (owner 2026-10-16): pending joins for a name, email or scanned member QR, and, when a QR is no
 * pending join, who it belongs to (so the cashier hears "already a member").
 */
export async function findPendingOrMember(
  q: string,
  { recent = false }: { recent?: boolean } = {},
): Promise<{ people: ThriftPendingPerson[]; member?: ThriftCodeMember }> {
  // `recent` with nothing typed: the newest 50 online joins, pending and finished (Finalize, owner 2026-10-16).
  const { data } = await api.post<{ people: ThriftPendingPerson[]; member?: ThriftCodeMember }>(
    '/thriftplus/register/pending/', recent ? { q, recent: true } : { q },
  );
  return data;
}

export interface ThriftFinishJoin {
  person: number;
  /** Ten digits, read back to them. Optional since Join v2 (owner 2026-10-19): not sent when blank. */
  phone?: string;
  id_checked: boolean;
  verified_18: boolean;
  /** Join v2: staff checked the face on the photo ID against the app selfie (the selfie path). */
  face_matches?: boolean;
  photo?: File | Blob | null;
  /** The customer's signature, a PNG (J5). */
  signature?: Blob | null;
  /** Finalize Thrift+ on a phone: the server requires the signature and the ID check. */
  finalize?: boolean;
  /** An open sale: the member goes on it after. */
  cart?: number | null;
}

export interface ThriftFinishResult {
  person_id: number;
  account_id: number;
  first_name: string;
  last_name: string;
  status: string;
  /** Newer servers: a signature is on file (J5). */
  signed?: boolean;
  /** The sale with the member on it (when a cart was sent and the attach worked). */
  cart: Cart | null;
  /** They joined, but could not go on the sale. */
  attach_error?: { code: string; detail: string };
}

/** Finish joining at the register (J8). 409 PHONE_TAKEN when another membership has that phone. */
export async function finishThriftJoin(body: ThriftFinishJoin): Promise<ThriftFinishResult> {
  const form = new FormData();
  form.append('person', String(body.person));
  if (body.phone) form.append('phone', body.phone);
  form.append('id_checked', String(body.id_checked));
  form.append('verified_18', String(body.id_checked && body.verified_18));
  if (body.face_matches !== undefined) form.append('face_matches', String(body.face_matches));
  if (body.photo) form.append('photo', body.photo, body.photo instanceof File ? body.photo.name : 'photo.jpg');
  if (body.signature) form.append('signature', body.signature, 'signature.png');
  if (body.finalize) form.append('finalize', 'true');
  if (body.cart) form.append('cart', String(body.cart));
  const { data } = await api.post<ThriftFinishResult>('/thriftplus/register/finish/', form, {
    transformRequest: [
      (b, headers) => {
        if (b instanceof FormData) delete headers['Content-Type'];
        return b;
      },
    ],
  });
  return data;
}

/** A pending member's QR (attach, re-ring, returns): the person to finish joining, or null for any other error. */
export function pendingFromError(err: unknown): ThriftPendingPerson | null {
  const data = (err as { response?: { data?: Partial<ThriftPendingPerson> & { code?: unknown } } })?.response?.data;
  if (!data || data.code !== 'MEMBER_PENDING' || typeof data.person_id !== 'number') return null;
  return {
    person_id: data.person_id,
    account_id: Number(data.account_id),
    first_name: data.first_name ?? '',
    last_name: data.last_name ?? '',
    email: data.email ?? '',
    joined_at: data.joined_at ?? '',
    code_last4: data.code_last4 ?? null,
    qr: data.qr ?? null,
    // Join v2: the selfie path at the register, when the server sends it.
    ...(data.photo_url !== undefined ? { photo_url: data.photo_url } : {}),
    ...(data.selfie !== undefined ? { selfie: Boolean(data.selfie) } : {}),
    ...(data.signed !== undefined ? { signed: Boolean(data.signed) } : {}),
    ...(data.contact !== undefined ? { contact: data.contact } : {}),
  };
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
