import api from './client';

/**
 * The Returns page and the owner PIN (owner 2026-10-20). Find by person, ticket or item, one ticket open, a summary,
 * several lines back in one call, and the owner PIN (set in Settings, typed by anyone where it is asked). Server:
 * apps/thriftplus (`returns_find.py`, `returns.py`, `owner_pin.py`). Money is dollars as strings.
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

export interface ReturnsReceipt {
  cart: number;
  practice: boolean;
  receipt_number: string;
  completed_at: string;
  total: string;
  tax: string;
  cashier: string;
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
  /** Their member card opens: `/pos/members?person=<person_id>`. */
  person_id: number;
  account_id: number;
  credit?: string;
  banked?: string;
  available?: string;
}

/** Confirm. Past the 3 days: `late` (reason, note) and the owner PIN (not needed when the owner is signed in). */
export async function confirmReturn(body: {
  cart: number;
  cart_lines: number[];
  register?: string;
  late?: { reason: LateReason; note?: string };
  pin?: string;
}): Promise<ReturnsDone> {
  const { data } = await api.post<ReturnsDone>('/thriftplus/returns/batch/', body);
  return data;
}

/** One row of the Late returns list (marks against Retail). */
export interface LateReturnRow {
  id: number;
  created_at: string;
  department: string;
  receipt_number: string;
  cart: number;
  sold_at: string | null;
  days_late: number | null;
  sku: string;
  title: string;
  member: string;
  credit: string;
  cashier: string;
  reason: LateReason;
  reason_label: string;
  note: string;
  entered_by: string;
  /** The manager whose own PIN allowed it, or the owner signed in (2026-10-21; empty on older marks). */
  approved_by?: string;
  by_pin: boolean;
}

export async function fetchLateReturns(): Promise<LateReturnRow[]> {
  const { data } = await api.get<LateReturnRow[]>('/thriftplus/returns/late/');
  return data;
}

/** The server's error code (`PIN_WRONG`, `PIN_LOCKED`, `SAY_WHY`...), or ''. */
export function returnsErrorCode(err: unknown): string {
  const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : '';
}
