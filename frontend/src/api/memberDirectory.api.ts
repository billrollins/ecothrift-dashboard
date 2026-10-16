/**
 * Dash → Users → Members (owner 2026-10-16): every member in one list and the drawer's actions
 * (`/api/thriftplus/member-directory/`, `apps/thriftplus/services/member_list.py`).
 */
import type { MemberDeletePreview } from '../types/thriftplus.types';
import api from './client';

/** Needs Finalize: email confirmed, finish at a register. Member: finalized. Off: deactivated or revoked. */
export type MemberStage = 'needs_finalize' | 'member' | 'off' | 'unconfirmed';

export interface MemberRow {
  /** `a<account>` (a member) or `c<user>` (an old ecothrift.us customer, until the legacy cleanup runs). */
  key: string;
  kind: 'member' | 'legacy';
  account_id: number | null;
  user_id: number | null;
  number: string;
  name: string;
  /** The second adult on the membership, if any. */
  second: string;
  email: string;
  phone: string;
  stage: MemberStage;
  since: string;
  bucks: string;
  bucks_lifetime: string;
  credit: string;
  /** Times they actually returned something (not the items that qualify). */
  returns: number;
  sales: number;
  spent: string;
  last_visit: string | null;
  holds_active: number;
  holds_total: number;
  needs_reply: boolean;
  notes: string;
  /** The staff member this membership is linked to. */
  staff: string;
  legacy: boolean;
}

const BASE = '/thriftplus/member-directory/';

export async function fetchMembers(): Promise<MemberRow[]> {
  const { data } = await api.get<{ results: MemberRow[] }>(BASE);
  return data.results;
}

export async function updateMember(key: string, body: Partial<Record<'first_name' | 'last_name' | 'email' | 'phone' | 'notes', string>>): Promise<MemberRow> {
  const { data } = await api.patch<MemberRow>(`${BASE}${key}/`, body);
  return data;
}

export async function sendMemberLink(key: string): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>(`${BASE}${key}/send-link/`, {});
  return data;
}

export async function deactivateMemberRow(key: string): Promise<MemberRow> {
  const { data } = await api.post<MemberRow>(`${BASE}${key}/deactivate/`, {});
  return data;
}

export async function reactivateMemberRow(key: string): Promise<MemberRow> {
  const { data } = await api.post<MemberRow>(`${BASE}${key}/reactivate/`, {});
  return data;
}

/** Superuser: what deleting the account removes (changes nothing). */
export async function fetchMemberRowDeletePreview(key: string): Promise<MemberDeletePreview> {
  const { data } = await api.get<MemberDeletePreview>(`${BASE}${key}/delete-preview/`);
  return data;
}

/** Superuser: delete the account, its links, its transactions and their payments. `name` must be typed to match. */
export async function deleteMemberRow(key: string, name: string): Promise<MemberDeletePreview & { items_back: number }> {
  const { data } = await api.post<MemberDeletePreview & { items_back: number }>(`${BASE}${key}/delete/`, { name });
  return data;
}

export const STAGE_LABEL: Record<MemberStage, string> = {
  needs_finalize: 'Needs Finalize',
  member: 'Member',
  off: 'Off',
  unconfirmed: 'Unconfirmed',
};

/** ThriftBucks, short: 135, 1.2K, 1.2M. */
export function shortBucks(raw: string | number | null | undefined): string {
  const n = Number.parseFloat(String(raw ?? '0')) || 0;
  const fmt = (v: number) => (v >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}M`;
  if (n >= 1_000) return `${fmt(n / 1_000)}K`;
  return n >= 100 ? Math.round(n).toString() : (Math.round(n * 100) / 100).toString();
}
