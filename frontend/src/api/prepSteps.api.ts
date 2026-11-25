// Truck Prep A: Steps (Dash #225). Backend: apps/prep_steps (`/api/prep-steps/`).
import api from './client';

export const STEP_KEYS = ['load', 'clean', 'match', 'category', 'retail', 'price', 'packs', 'send'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export interface PrepCandidate {
  product_id: number;
  sim: number;
  id: string;
  number: string;
  title: string;
  brand: string;
  category: string;
  retail_avg: number | null;
  sold: number;
  avg_sold: number | null;
}

export interface PrepProduct {
  number: string;
  title: string;
  brand: string;
  retail_avg: number | null;
  sold: number;
  avg_sold: number | null;
  items?: number;
  on_shelf?: number;
}

export interface PrepLine {
  id: number;
  row_number: number;
  src_title: string;
  src_brand: string;
  src_model: string;
  src_qty: number;
  src_retail: number | null;
  src_ext_retail: number | null;
  src_category: string;
  src_subcategory: string;
  src_condition: string;
  upc: string;
  item_number: string;
  image_url: string;
  page_url: string;
  title: string;
  brand: string;
  model: string;
  qty: number;
  match_product_id: number | null;
  match_kind: '' | 'is' | 'like' | 'new';
  match_confidence: number | null;
  match_candidates: PrepCandidate[];
  category: string;
  subcategory: string;
  retail: number | null;
  price: number | null;
  price_class: string;
  unit_count: number | null;
  unit_name: string;
  pack_units: number | null;
  pieces: number;
  sell_as: string;
  search_tags: string[];
  reasons: Record<string, string>;
  sources: Record<string, string>;
  accepted: string[];
  flags: Partial<Record<StepKey, string[]>>;
  open: StepKey[];
  pack: string;
  product?: PrepProduct;
  raw?: Record<string, string>;
}

export interface PrepAction {
  id: number;
  step: StepKey;
  kind: 'rule' | 'ai' | 'custom' | 'edit';
  name: string;
  label: string;
  model: string;
  effort: string;
  status: 'running' | 'preview' | 'applied' | 'undone' | 'failed' | 'discarded';
  line_count: number;
  changed_count: number;
  seconds: number;
  cost: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  batches_done: number;
  batches_total: number;
  prompt: string;
  error: string;
  created_at: string;
  preview_count: number;
}

export interface PreviewChange {
  i: number;
  line: number;
  row_number: number;
  title: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string;
}

export interface PrepActionDetail extends PrepAction {
  preview: PreviewChange[];
  changes?: Omit<PreviewChange, 'i'>[];
}

export interface PrepStepState {
  key: StepKey;
  label: string;
  state: '' | 'open' | 'done';
  open: number;
  flags: Record<string, number>;
  cost: number;
  seconds: number;
}

export interface PrepRun {
  id: number;
  order_id: number;
  order_number: string;
  vendor: string;
  description: string;
  step: StepKey;
  steps: PrepStepState[];
  target: { share: number; band: number; total: number };
  totals: {
    lines: number;
    units: number;
    pieces: number;
    manifest_retail: number;
    retail: number;
    tag: number;
    cost: number;
    ai_cost: number;
    seconds: number;
  };
  actions: PrepAction[];
  load_info: { source?: string; headers?: string[]; columns?: Record<string, string>; lines?: number };
  flag_text: Record<string, string>;
  categories?: Record<string, string[]>;
  ai_jobs?: Record<string, { model: string; effort: string; per_line: number }>;
  send?: SendState;
}

export interface LineHistory {
  action: number;
  step: StepKey;
  label: string;
  kind: string;
  model: string;
  status: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string;
  at: string;
}

export interface PrepState {
  run: PrepRun;
  lines?: PrepLine[];
  action?: PrepAction;
}

export interface PrepOrderRow {
  id: number;
  order_number: string;
  vendor: string;
  description: string;
  lines: number;
  retail: number;
  cost: number;
  created_at: string | null;
  prep: { step: StepKey; steps: Record<string, { state: string }>; updated_at: string } | null;
}

export interface Handoff {
  row_number: number;
  manifest_row_id: number | null;
  preprocessing_row_id: number | null;
  search_tags: string[];
  product_match: { product_id: number; number: string; kind: 'is' | 'like'; confidence: number | null; reason: string } | null;
  product_draft: {
    title: string;
    brand: string;
    model: string;
    category: string;
    subcategory: string;
    retail: number | null;
    unit_count: number | null;
    unit_name: string;
    pack_units: number | null;
    pack: string;
    photo_url: string;
    page_url: string;
  } | null;
  price: number | null;
  price_reason: string;
  retail: number | null;
  retail_reason: string;
  pieces: number;
  pieces_reason: string;
  sell_as: string;
  category: string;
  subcategory: string;
}

/** Where the truck stands: in Processing or not, and why Send and Undo send are closed ('' while they are open). */
export interface SendState {
  sent: boolean;
  sent_at: string | null;
  rows: number;
  blocked: string;
  processing_url: string;
}

/** What Send would write (nothing is written by the preview), the open lines, and where the truck stands. */
export interface SendPreview {
  lines: (Handoff & { title: string; qty: number })[];
  would_write: number;
  matched: number;
  like: number;
  drafts: number;
  priced: number;
  written: number;
  open: { lines: number; no_product: number; no_price: number; no_retail: number };
  state: SendState;
}

export interface SendResult {
  written: number;
  again: boolean;
  priced_by_rule: number;
  by_unit: number;
  products: number;
}

export interface LineChange {
  line: number;
  field: string;
  new: unknown;
  reason?: string;
}

const base = '/prep-steps';

export const prepStepsApi = {
  orders: (q = '') => api.get<{ orders: PrepOrderRow[] }>(`${base}/orders/`, { params: q ? { q } : {} }).then((r) => r.data),
  run: (orderId: number) =>
    api
      .get<{ run: PrepRun | null; order?: { id: number; order_number: string; vendor: string; description: string } }>(
        `${base}/orders/${orderId}/`,
      )
      .then((r) => r.data),
  lines: (orderId: number, raw = false) =>
    api.get<{ lines: PrepLine[] }>(`${base}/orders/${orderId}/lines/`, { params: raw ? { raw: 1 } : {} }).then((r) => r.data),
  start: (orderId: number, columns?: Record<string, string>) =>
    api.post<PrepState>(`${base}/orders/${orderId}/start/`, columns ? { columns } : {}).then((r) => r.data),
  step: (orderId: number, to: StepKey | 'next' | 'back') =>
    api.post<PrepState>(`${base}/orders/${orderId}/step/`, { to }).then((r) => r.data),
  rule: (orderId: number, name: string, ids?: number[] | null, extra?: Record<string, unknown>, force = false) =>
    api.post<PrepState>(`${base}/orders/${orderId}/rule/`, { name, ids: ids ?? null, extra, force }).then((r) => r.data),
  edit: (orderId: number, step: StepKey, changes: LineChange[]) =>
    api.post<PrepState>(`${base}/orders/${orderId}/edit/`, { step, changes }).then((r) => r.data),
  accept: (orderId: number, step: StepKey, ids: number[], value = true) =>
    api.post<PrepState>(`${base}/orders/${orderId}/accept/`, { step, ids, value }).then((r) => r.data),
  target: (orderId: number, body: { share?: number; band?: number }) =>
    api.patch<PrepState>(`${base}/orders/${orderId}/target/`, body).then((r) => r.data),
  ai: (orderId: number, body: { name: string; ids: number[]; prompt?: string; fields?: string[]; strength?: string; step?: StepKey }) =>
    api.post<{ action: PrepActionDetail }>(`${base}/orders/${orderId}/ai/`, body).then((r) => r.data),
  action: (actionId: number) => api.get<{ action: PrepActionDetail }>(`${base}/actions/${actionId}/`).then((r) => r.data),
  apply: (actionId: number, skip: number[] = []) =>
    api.post<PrepState>(`${base}/actions/${actionId}/apply/`, { skip }).then((r) => r.data),
  discard: (actionId: number) => api.post<PrepState>(`${base}/actions/${actionId}/discard/`).then((r) => r.data),
  undo: (actionId: number) => api.post<PrepState>(`${base}/actions/${actionId}/undo/`).then((r) => r.data),
  line: (orderId: number, lineId: number) =>
    api.get<{ line: PrepLine; history: LineHistory[] }>(`${base}/orders/${orderId}/lines/${lineId}/`).then((r) => r.data),
  /** What Send would write. Writes nothing. */
  send: (orderId: number) => api.get<SendPreview>(`${base}/orders/${orderId}/send/`).then((r) => r.data),
  /** Hand the truck to Processing (or hand it again). Refused with 409 once anything is checked in. */
  sendNow: (orderId: number) =>
    api.post<PrepState & { send: SendResult }>(`${base}/orders/${orderId}/send/`).then((r) => r.data),
  undoSend: (orderId: number) =>
    api.post<PrepState & { undo_send: { removed: number } }>(`${base}/orders/${orderId}/send/undo/`).then((r) => r.data),
};
