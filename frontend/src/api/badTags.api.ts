import api from './client';
import type { ItemBrief } from './stocktake.api';

/** Bad tags (retail_tags_and_social Phase 1): a wrong tag found on the floor, traced back, sent to PR Fix-it. */
export type BadTagReason = 'retail_high' | 'wrong_item' | 'price_high' | 'price_low' | 'missing';
export type BadTagWhere = 'section_check' | 'cross_check' | 'register' | 'today' | 'fresh_tags';

export interface BadTagReasonOption {
  key: BadTagReason;
  label: string;
  label_es: string;
}

export const BAD_TAG_REASONS: BadTagReasonOption[] = [
  { key: 'retail_high', label: 'Retail overstated', label_es: 'Precio de lista inflado' },
  { key: 'wrong_item', label: 'Wrong item', label_es: 'Articulo equivocado' },
  { key: 'price_high', label: 'Price too high', label_es: 'Precio muy alto' },
  { key: 'price_low', label: 'Price too low', label_es: 'Precio muy bajo' },
  { key: 'missing', label: 'Tag missing or unreadable', label_es: 'Falta etiqueta o no se lee' },
];

export interface BadTagTrace {
  checked_in_by: string;
  checked_in_by_id: number | null;
  checked_in_at: string | null;
  purchase_order_id: number | null;
  order_number: string;
  manifest_row_id: number | null;
  manifest_row_number: number | null;
  pallet: { id: number; number: number; code: string } | null;
}

export interface BadTag {
  id: number;
  code: string;
  reason: BadTagReason;
  reason_label: string;
  reason_label_es: string;
  where: BadTagWhere;
  where_label: string;
  detail: string;
  right_price: string | null;
  right_retail: string | null;
  photo_url: string | null;
  found_by: string;
  found_at: string;
  tag_price: string | null;
  tag_retail: string | null;
  retail_check: string;
  item: ItemBrief | null;
  trace: BadTagTrace;
  issue_id: number | null;
  fixed_at: string | null;
  fixed_by: string;
  fix: string;
}

export interface BadTagLookup {
  found: boolean;
  code: string;
  item: ItemBrief | null;
  tag_retail?: string | null;
  retail_check?: string;
  checked_in_by?: string;
  checked_in_at?: string | null;
  order_number?: string;
}

export interface BadTagListResponse {
  reasons: BadTagReasonOption[];
  manager: boolean;
  rows: BadTag[];
  /** More than 300 matched; narrow the week or filters. */
  truncated?: boolean;
}

export interface BadTagListParams {
  /** ISO week, e.g. 2026-W43. */
  week?: string;
  processor?: number;
  po?: number;
  reason?: BadTagReason | '';
  show?: 'all' | 'open' | 'fixed';
}

export interface BadTagCountRow {
  count: number;
  by_reason: Partial<Record<BadTagReason, number>>;
}

export interface BadTagSummary {
  week_start: string;
  total: number;
  open: number;
  by_reason: { key: BadTagReason; label: string; count: number }[];
  by_processor: (BadTagCountRow & { user_id: number | null; name: string; checked_in_this_week: number })[];
  by_truck: (BadTagCountRow & { purchase_order_id: number | null; order_number: string })[];
}

export interface RecordBadTagBody {
  code: string;
  reason: BadTagReason;
  where: BadTagWhere;
  detail?: string;
  right_price?: string;
  right_retail?: string;
  /** A data URL (image/jpeg or image/png). */
  photo?: string;
}

const B = '/stocktake/bad-tags';

export async function lookupBadTag(code: string): Promise<BadTagLookup> {
  return (await api.get<BadTagLookup>(`${B}/lookup/`, { params: { code } })).data;
}

export async function recordBadTag(body: RecordBadTagBody): Promise<BadTag> {
  return (await api.post<BadTag>(`${B}/`, body)).data;
}

export async function listBadTags(params: BadTagListParams = {}): Promise<BadTagListResponse> {
  return (await api.get<BadTagListResponse>(`${B}/`, { params })).data;
}

export async function getBadTagSummary(week?: string): Promise<BadTagSummary> {
  return (await api.get<BadTagSummary>(`${B}/summary/`, { params: week ? { week } : {} })).data;
}

/** Same-origin photo stream (needs the session's auth header: load through api, not an <img src>). */
export async function fetchBadTagPhoto(url: string): Promise<Blob> {
  return (await api.get<Blob>(url.replace(/^\/api/, ''), { responseType: 'blob' })).data;
}
