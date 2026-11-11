import api from './client';
import type { RestorationRequestPayload, RestorationTagFacts } from '../types/inventory.types';

/**
 * Items back in Processing (Dash Updates #83 and #84; server: `apps/inventory/services/reentry.py`). A customer return
 * and a floor issue share one list and one set of actions; `source` says which page shows a row.
 */
export type ReentrySource = 'return' | 'floor';
export type ReentryOutcome = 'repriced' | 'shelf' | 'restoration' | 'scrapped' | 'handled';

/** What the price tag needs (the input of `printProcessingLabel`), plus the restoration tag after a send. */
export interface ReentryItem {
  id: number;
  sku: string;
  price: string | null;
  product_title: string;
  product_brand: string;
  product_number: string;
  tag_retail: string | null;
  status?: string;
  status_label?: string;
  condition_label?: string;
  retail?: string | null;
  restoration_tag?: RestorationTagFacts;
}

export interface ReentryRow {
  id: number;
  source: ReentrySource;
  source_label: string;
  /** Why it came back, in a few words ('' when nobody said). */
  reason: string;
  reported_by: string;
  reported_at: string;
  item: ReentryItem;
  /** A register return: the sale it came from. */
  sale: { sold_at: string | null; sold_price: string | null; receipt_number: string; cart: number } | null;
  outcome: ReentryOutcome | '';
  outcome_label: string;
  outcome_note: string;
  old_price: string | null;
  new_price: string | null;
  restoration_job: number | null;
  decided_by: string;
  decided_at: string | null;
}

export interface ReentryList {
  source: ReentrySource;
  done: boolean;
  /** How many are waiting on each page. */
  waiting: Record<ReentrySource, number>;
  /** How many were decided today, on each page. */
  done_today?: Record<ReentrySource, number>;
  results: ReentryRow[];
}

/** An action's answer: the closed row, and the item's tag facts to print from. */
export interface ReentryDone {
  row: ReentryRow;
  item: ReentryItem;
}

export interface ReentryFound {
  item: ReentryItem;
  /** Its row when it is waiting (on either page). */
  row: ReentryRow | null;
  /** Not waiting: the last time it was decided (what was done, who, when), or null when it never was. */
  last?: ReentryRow | null;
}

export async function listReentries(source: ReentrySource, done = false): Promise<ReentryList> {
  const { data } = await api.get<ReentryList>('/inventory/reentries/', { params: { source, ...(done ? { done: 1 } : {}) } });
  return data;
}

export async function findReentry(code: string, source: ReentrySource): Promise<ReentryFound> {
  const { data } = await api.get<ReentryFound>('/inventory/reentries/find/', { params: { code, source } });
  return data;
}

/** Put an item on the list (a floor report, or a return that did not go through the register). */
export async function reportReentry(sku: string, source: ReentrySource, reason = ''): Promise<ReentryRow> {
  const { data } = await api.post<ReentryRow>('/inventory/reentries/', { sku, source, reason });
  return data;
}

export async function reentryPriceAgain(id: number, price: string): Promise<ReentryDone> {
  const { data } = await api.post<ReentryDone>(`/inventory/reentries/${id}/price-again/`, { price });
  return data;
}

export async function reentryBackToShelf(id: number): Promise<ReentryDone> {
  const { data } = await api.post<ReentryDone>(`/inventory/reentries/${id}/back-to-shelf/`);
  return data;
}

export async function reentrySendToRestoration(id: number, restoration: RestorationRequestPayload): Promise<ReentryDone> {
  const { data } = await api.post<ReentryDone>(`/inventory/reentries/${id}/send-to-restoration/`, { restoration });
  return data;
}

export async function reentryScrap(id: number, reason: string): Promise<ReentryDone> {
  const { data } = await api.post<ReentryDone>(`/inventory/reentries/${id}/scrap/`, { reason });
  return data;
}
