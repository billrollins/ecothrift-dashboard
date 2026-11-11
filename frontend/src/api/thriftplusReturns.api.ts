import api from './client';

/**
 * The Register's Return window (owner 2026-10-20; #71). Find by person, ticket or item, one ticket open, a summary,
 * several lines back in one call; past the 3 days a manager's own register PIN (or the owner signed in). Server:
 * apps/thriftplus (`returns_find.py`, `returns.py`). Money is dollars as strings.
 */

/** One person Find turned up: enough to pick them by their photo and name. */
export interface ReturnsPerson {
  person_id: number;
  account_id: number;
  first_name: string;
  last_name: string;
  name: string;
  photo_url: string | null;
  status: string;
  role: string;
  phone_last4: string | null;
  contact: string;
}

/** One ticket in a list: newest first. */
export interface ReturnsTicket {
  cart: number;
  receipt_number: string;
  completed_at: string;
  items: number | null;
  total: string;
  /** The member's name, or '' for a guest sale. */
  member: string;
  practice: boolean;
}

export type ReturnsLineState = 'returnable' | 'as_is' | 'returned';

export interface ReturnsLine {
  cart_line: number;
  sku: string;
  title: string;
  quantity: number;
  price: string;
  mark: string;
  /** Thrift+ credit back: 80% of what was paid, tax included. */
  refund: string;
  bucks_back: string;
  bucks_take: string;
  photos: string[];
  /** `returnable` (with `late` set past the 3 days), `as_is` (with `why`), or `returned`. */
  state: ReturnsLineState;
  late: boolean;
  why: string;
}

/** One reason a returned item can be given (#90): the server's short list, in order. */
export interface ReturnReasonOption {
  value: string;
  label: string;
}

/** Why one item is coming back: a reason from the list and the cashier's optional note. */
export interface ReturnReasonPick {
  reason: string;
  note: string;
}

export interface ReturnsReceipt {
  cart: number;
  practice: boolean;
  receipt_number: string;
  completed_at: string;
  total: string;
  tax: string;
  cashier: string;
  /** How the sale was paid: cash, card, split, thrift (Thrift+ in full) or payroll. */
  payment_method?: string;
  /** The reasons a returned item can be given. */
  return_reasons?: ReturnReasonOption[];
  /** ISO date: the last day returns are taken without the owner (sale day + 3). */
  deadline: string;
  late: boolean;
  closed_note: string;
  member: {
    person_id: number;
    account_id: number;
    name: string;
    photo_url: string | null;
    banked?: string;
    available?: string;
    bucks_use_by?: string | null;
    credit?: string;
  } | null;
  lines: ReturnsLine[];
}

export type ReturnsFindKind = 'none' | 'person' | 'people' | 'ticket' | 'item' | 'date' | 'total' | 'words';

export interface ReturnsFind {
  kind: ReturnsFindKind;
  people: ReturnsPerson[];
  person: ReturnsPerson | null;
  tickets: ReturnsTicket[];
  message: string;
  /** A single ticket comes back already open. */
  receipt: ReturnsReceipt | null;
}

/** Step 1. A POST, so names and phones stay out of the request logs. */
export async function findReturns(q: string, opts: { person?: number; register?: string } = {}): Promise<ReturnsFind> {
  const { data } = await api.post<ReturnsFind>('/thriftplus/returns/find/', { q, ...opts });
  return data;
}

/** Step 2: open one ticket. */
export async function getReturnsReceipt(cart: number, register = ''): Promise<ReturnsReceipt> {
  const { data } = await api.get<ReturnsReceipt>('/thriftplus/returns/receipt/', { params: { cart, register } });
  return data;
}

export interface ReturnsSummaryLine {
  cart_line: number;
  sku: string;
  title: string;
  refund: string;
  /** The Thrift+ credit given: the refund less any shortfall. */
  credit: string;
  bucks_back: string;
  bucks_taken: string;
  shortfall: string;
  late: boolean;
  problems: string[];
}

export interface ReturnsTotals {
  credit: string;
  bucks_back: string;
  bucks_taken: string;
  shortfall: string;
  refund?: string;
}

export interface ReturnsSummary {
  lines: ReturnsSummaryLine[];
  totals: ReturnsTotals;
  /** Some line is past the 3 days: the owner PIN and a reason are asked. */
  late: boolean;
  ok: boolean;
  owner_signed_in: boolean;
  reasons: { value: LateReason; label: string }[];
}

export type LateReason = 'told_wrong' | 'closed' | 'owner';

/** Step 3: the summary before Confirm. */
export async function previewReturn(cart: number, lines: number[], register = ''): Promise<ReturnsSummary> {
  const { data } = await api.post<ReturnsSummary>('/thriftplus/returns/preview/', { cart, cart_lines: lines, register });
  return data;
}

export interface ReturnsDone {
  totals: ReturnsTotals;
  training: boolean;
  /** Their member card: `/pos/members?person=<person_id>`. */
  person_id: number;
  account_id: number;
  /** Their Thrift+ credit after the return. */
  credit?: string;
  banked?: string;
  available?: string;
  /** The return receipt, ready for the print server (`POST /print/receipt`): one per sale. Null if it could not be made. */
  receipt?: Record<string, unknown> | null;
}

/** Confirm. `reasons`: why each item is coming back, by cart line (#90). Past the 3 days: `late` (reason, note) and a
 * manager's PIN (not needed when the owner is signed in). */
export async function confirmReturn(body: {
  cart: number;
  cart_lines: number[];
  register?: string;
  reasons?: Record<string, { reason: string; note?: string }>;
  late?: { reason: LateReason; note?: string };
  pin?: string;
}): Promise<ReturnsDone> {
  const { data } = await api.post<ReturnsDone>('/thriftplus/returns/batch/', body);
  return data;
}

/** One return in Transactions → Returns (#72): a row of its own, on the day it came back. */
export interface ReturnHistoryRow {
  id: number;
  created_at: string;
  /** The sale it came from (its Sale window opens). */
  cart: number;
  receipt_number: string;
  sold_at: string | null;
  sku: string;
  title: string;
  member: string;
  person_id: number;
  credit: string;
  bucks_taken: string;
  bucks_back: string;
  /** Who took it at the register. */
  returned_by: string;
  /** Why it came back (#90): the reason's words, and the cashier's note. '' on returns taken before reasons were asked. */
  reason?: string;
  reason_note?: string;
  /** Past the 3 days (a mark against Retail). */
  late: boolean;
  /** The mark itself: managers and the owner only (null for everyone else and for on-time returns). */
  mark: {
    reason_label: string;
    note: string;
    /** The cashier who rang the sale: the mark is against them. */
    cashier: string;
    approved_by: string;
    by_pin: boolean;
    days_late: number | null;
  } | null;
}

export interface ReturnHistoryPage {
  count: number;
  credit_total: string;
  results: ReturnHistoryRow[];
}

export async function fetchReturnHistory(params: Record<string, string | number>): Promise<ReturnHistoryPage> {
  const { data } = await api.get<ReturnHistoryPage>('/thriftplus/returns/history/', { params });
  return data;
}

/** The server's error code (`PIN_WRONG`, `PIN_LOCKED`, `SAY_WHY`...), or ''. */
export function returnsErrorCode(err: unknown): string {
  const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : '';
}
