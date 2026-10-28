import api from './client';

/** Supplies (owner, 2026-10-26; apps/supplies). Lists for everyone, edits for managers, the order for the owner.
 * Money is "12.34" or null. */

export interface SupplyCycle {
  /** Monday of the week the count is due. */
  week_start: string;
  /** ISO time of the deadline (Settings → Store → Supplies). */
  deadline: string;
}

export interface SupplyCountStatus {
  id: number;
  submitted_at: string;
  counted_by: string;
}

export interface SupplyItem {
  id: number;
  list: number;
  name: string;
  description: string;
  vendor: string;
  vendor_url: string;
  url: string;
  vendor_item_id: string;
  pack_size: number;
  unit: string;
  min_qty: number;
  max_qty: number;
  price: string | null;
  sort_order: number;
}

export type SupplyItemInput = Partial<Omit<SupplyItem, 'id' | 'list' | 'price'>> & { price?: string | null };

export interface SupplyListSummary {
  id: number;
  name: string;
  department: number | null;
  department_name: string;
  is_active: boolean;
  sort_order: number;
  item_count: number | null;
  /** This cycle's count, or null when not counted yet. */
  count: SupplyCountStatus | null;
}

export interface SupplyListDetail extends SupplyListSummary {
  items: SupplyItem[];
  can_edit: boolean;
  cycle: SupplyCycle;
}

export interface SupplyListsResponse {
  cycle: SupplyCycle;
  can_edit: boolean;
  is_owner: boolean;
  lists: SupplyListSummary[];
  /** Waiting requests (managers and the owner; null for others). */
  pending_requests: number | null;
  /** This person's last 10 requests. */
  my_requests: SupplyRequest[];
  /** Ordered lines still on their way. */
  receive_waiting: number;
}

export interface CountItem extends SupplyItem {
  last_count: number | null;
  this_count: number | null;
  packs?: number;
  reason?: string;
}

export interface CountResponse {
  list: { id: number; name: string };
  cycle: SupplyCycle;
  count: SupplyCountStatus | null;
  last_count_week: string | null;
  items: CountItem[];
}

export interface AiFill {
  name: string;
  description: string;
  vendor: string;
  vendor_url: string;
  url: string;
  vendor_item_id: string;
  price: string | null;
  pack_size: number;
  unit: string;
  model: string;
  price_found: boolean;
}

export interface ImportResult {
  added: number;
  updated: number;
  errors: { row: number; error: string }[];
}

export interface OrderLine {
  id: number;
  list_name: string;
  name: string;
  vendor: string;
  vendor_url: string;
  url: string;
  vendor_item_id: string;
  unit: string;
  pack_size: number;
  min_qty: number;
  max_qty: number;
  on_hand: number;
  packs: number;
  price: string | null;
  line_total: string | null;
  reason: string;
  /** '' not checked, 'ok', or 'broken' (the page was gone). */
  link_status: '' | 'ok' | 'broken';
  ordered_at: string | null;
  ordered_by: string;
  /** Packs in so far. */
  received_qty: number;
  received_at: string | null;
  received_by: string;
}

export interface OrderVendor {
  vendor: string;
  vendor_url: string;
  is_amazon: boolean;
  /** One Amazon add-to-cart link with every ASIN and quantity ('' when none). */
  cart_url: string;
  /** Amazon lines with no ASIN, so not in the cart link. */
  not_in_cart: number;
  total: string;
  unpriced: number;
  ordered: boolean;
  lines: OrderLine[];
}

export interface SupplyOrder {
  id: number;
  week_start: string;
  deadline: string;
  built_at: string;
  missed_lists: string[];
  vendors: OrderVendor[];
  total: string;
  line_count: number;
  open_count: number;
  /** Ordered lines not all in yet. */
  waiting_count: number;
}

export interface OrderResponse {
  order: SupplyOrder | null;
  weeks: string[];
  missed_now: string[];
  cycle: SupplyCycle;
}

export const getSupplyLists = (all = false) =>
  api.get<SupplyListsResponse>('/supplies/lists/', { params: all ? { all: 1 } : {} }).then((r) => r.data);
export const createSupplyList = (body: { name: string; department?: number | null }) =>
  api.post<SupplyListDetail>('/supplies/lists/', body).then((r) => r.data);
export const getSupplyList = (id: number) => api.get<SupplyListDetail>(`/supplies/lists/${id}/`).then((r) => r.data);
export const updateSupplyList = (id: number, body: Partial<Pick<SupplyListSummary, 'name' | 'department' | 'is_active' | 'sort_order'>>) =>
  api.patch<SupplyListDetail>(`/supplies/lists/${id}/`, body).then((r) => r.data);
export const addSupplyItem = (listId: number, body: SupplyItemInput) =>
  api.post<SupplyItem>(`/supplies/lists/${listId}/items/`, body).then((r) => r.data);
export const updateSupplyItem = (id: number, body: SupplyItemInput) =>
  api.patch<SupplyItem>(`/supplies/items/${id}/`, body).then((r) => r.data);
export const removeSupplyItem = (id: number) => api.delete(`/supplies/items/${id}/`);
export const importSupplyCsv = (listId: number, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post<ImportResult>(`/supplies/lists/${listId}/import/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      validateStatus: (s) => s === 200 || s === 400,
    })
    .then((r) => r.data);
};
export const downloadSupplyTemplate = () =>
  api.get<Blob>('/supplies/import-template/', { responseType: 'blob' }).then((r) => r.data);
export const aiFillSupply = (body: { url: string; page_text?: string }) =>
  api.post<AiFill>('/supplies/ai-fill/', body).then((r) => r.data);

export const getSupplyCount = (listId: number) =>
  api.get<CountResponse>(`/supplies/lists/${listId}/count/`).then((r) => r.data);
export const submitSupplyCount = (listId: number, lines: { item: number; on_hand: number }[]) =>
  api.post<CountResponse>(`/supplies/lists/${listId}/count/`, { lines }).then((r) => r.data);

export const getSupplyOrder = (week?: string) =>
  api.get<OrderResponse>('/supplies/order/', { params: week ? { week } : {} }).then((r) => r.data);
export const buildSupplyOrder = () => api.post<{ detail: string }>('/supplies/order/build/').then((r) => r.data);
export const markSupplyOrdered = (orderId: number, lineIds: number[], ordered: boolean) =>
  api.post<SupplyOrder>(`/supplies/order/${orderId}/ordered/`, { line_ids: lineIds, ordered }).then((r) => r.data);

// ── Received, spend and requests (owner, 2026-10-28) ────────────────────────────

export interface ReceiveLine {
  id: number;
  week_start: string;
  list_name: string;
  name: string;
  vendor: string;
  url: string;
  unit: string;
  pack_size: number;
  packs: number;
  received_qty: number;
  received_at: string | null;
  received_by: string;
  status: 'waiting' | 'partial' | 'in';
}

export const getReceiveLines = () =>
  api.get<{ lines: ReceiveLine[] }>('/supplies/receive/').then((r) => r.data.lines);
/** `received_qty`: the packs in so far (0 to the packs ordered). */
export const setReceived = (lineId: number, receivedQty: number) =>
  api.post<ReceiveLine>(`/supplies/lines/${lineId}/received/`, { received_qty: receivedQty }).then((r) => r.data);

export interface SpendRow {
  name: string;
  /** One per period, oldest first. */
  amounts: string[];
  total: string;
}

export interface SupplySpend {
  by: 'week' | 'month';
  /** Week Mondays or month firsts, oldest first. */
  periods: string[];
  vendors: SpendRow[];
  lists: SpendRow[];
  totals: string[];
  /** Ordered lines with no price, so not in the money. */
  unpriced: number;
}

export const getSupplySpend = (by: 'week' | 'month') =>
  api.get<SupplySpend>('/supplies/spend/', { params: { by } }).then((r) => r.data);
export const getSupplySpendSummary = () =>
  api.get<{ this_week: string; this_month: string }>('/supplies/spend/', { params: { summary: 1 } }).then((r) => r.data);

export type SupplyRequestStatus = 'pending' | 'approved' | 'declined';

export interface SupplyRequest {
  id: number;
  name: string;
  url: string;
  note: string;
  photo_url: string | null;
  list: number | null;
  list_name: string;
  requested_by: string;
  requested_by_id: number | null;
  created_at: string;
  status: SupplyRequestStatus;
  decided_by: string;
  decided_at: string | null;
  decline_reason: string;
  item: number | null;
}

export const getSupplyRequests = (status?: SupplyRequestStatus) =>
  api
    .get<{ can_decide: boolean; requests: SupplyRequest[] }>('/supplies/requests/', { params: status ? { status } : {} })
    .then((r) => r.data);
export const createSupplyRequest = (body: { name: string; url?: string; note?: string; list?: number | null; photo?: File | null }) => {
  const form = new FormData();
  form.append('name', body.name);
  if (body.url) form.append('url', body.url);
  if (body.note) form.append('note', body.note);
  if (body.list) form.append('list', String(body.list));
  if (body.photo) form.append('photo', body.photo);
  return api
    .post<SupplyRequest>('/supplies/requests/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};
export const approveSupplyRequest = (id: number, body: SupplyItemInput & { list: number }) =>
  api.post<SupplyRequest>(`/supplies/requests/${id}/approve/`, body).then((r) => r.data);
export const declineSupplyRequest = (id: number, reason: string) =>
  api.post<SupplyRequest>(`/supplies/requests/${id}/decline/`, { reason }).then((r) => r.data);
