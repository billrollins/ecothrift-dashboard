import api from './client';

export type ScanResultKind = 'ok' | 'already' | 'odd' | 'unknown' | 'bad_format';

export type IssueKind =
  | 'not_sku'
  | 'not_recognized'
  | 'already_sold'
  | 'not_on_shelf'
  | 'already_scanned'
  | 'wrong_title'
  | 'wrong_tag'
  | 'price_high'
  | 'price_low'
  | 'no_tag'
  | 'wrong_section';

/** What the person did with the item on the floor. `pending` = no answer yet. */
/** ``kept``: a sold tag in hand, kept here; its old sale moved to a new item number. */
export type IssueAction = 'pending' | 'cleared' | 'pr_cart' | 'left' | 'relocate' | 'kept';

export type CartKind = 'pr' | 'relocate';

export type FixKind =
  | 'reprint' | 'edit' | 'print_as_new' | 'put_on_shelf' | 'use_item' | 'quick_add' | 'moved' | 'dismiss'
  | 'shrink' | 'set_product' | 'new_from_product' | 'move_sale';

/** Why an item is shrink: stolen (lost) or broken / scrap (scrapped). */
export type ShrinkReason = 'stolen' | 'broken' | 'scrap';

/** Where a section stands today. */
export type SectionState = 'done' | 'in_progress' | 'not_started';

export interface Section {
  id: number;
  name: string;
  order: number;
  is_active: boolean;
  /** Someone finished this section today. */
  complete?: boolean;
  state?: SectionState;
  /** Items counted in this section today. */
  counted?: number;
  /** Items counted here the last earlier day the section was completed: what it should hold now. Null = never done. */
  expected?: number | null;
  expected_day?: string | null;
}

/** One day's count: every run that day adds up to one inventory. */
export interface DaySummary {
  id: number;
  name: string;
  day: string | null;
  status: 'open' | 'closed';
  /** In progress, then Done (owner, 2026-10-06). */
  stage?: InventoryStage;
  /** True for the newest inventory: PR Fix-it and the shrink estimates still work on it after it is done. */
  latest?: boolean;
  started_by?: string;
  note: string;
  started_at: string;
  closed_at: string | null;
  /** Who closed it (first name), when closed. */
  closed_by?: string;
  /** The days it had runs (YYYY-MM-DD), oldest first. One inventory can run over several days. */
  days_active?: string[];
  expected: number;
  counted: number;
  scans: number;
  runs: number;
  sections_done: number;
  sections_in_progress: number;
  sections_total: number;
  issues_pending: number;
  issues_total: number;
  to_fix: number;
  /** The server's clock when this was sent (ISO), so timers do not depend on the phone's clock. */
  server_now?: string;
  /** A count from the first version (no day, no sections). */
  trial?: boolean;
}

export interface RunSummary {
  id: number;
  count_id: number;
  section: { id: number; name: string };
  user: string;
  user_id: number | null;
  status: 'open' | 'stopped' | 'bad';
  section_complete: boolean;
  note: string;
  started_at: string;
  stopped_at: string | null;
  scans: number;
  counted: number;
  removed: number;
  issues_pending: number;
  issues_total: number;
}

export interface ScanPost {
  client_id: string;
  code: string;
  seq: number;
  scanned_at: string;
}

export interface ScanResult {
  id: number;
  client_id: string;
  seq: number;
  code: string;
  result: ScanResultKind;
  item_status: string;
  title: string;
  price: string | null;
  retail: string | null;
  location: string;
  scanned_at: string;
  removed: boolean;
  issue_id: number | null;
  issue_kind: IssueKind | '';
  issue_action: IssueAction | '';
  first_seen: { section: string; by: string; at: string } | null;
}

export interface ItemBrief {
  id: number;
  sku: string;
  title: string;
  brand: string;
  product_number: string;
  price: string;
  retail: string | null;
  status: string;
  location: string;
}

/** What the local print server needs to print a price tag. */
export interface TagLabel {
  qr_data: string;
  text: string;
  product_title: string;
  product_brand: string;
  product_model: string;
  include_text: boolean;
}

export interface Issue {
  id: number;
  count_id: number;
  day: string | null;
  run_id: number;
  run_bad: boolean;
  section: string;
  scan_id: number | null;
  code: string;
  kind: IssueKind;
  kind_label: string;
  action: IssueAction;
  cart: string;
  cart_kind: CartKind | '';
  target_section: string;
  detail: string;
  by: string;
  created_at: string;
  item: ItemBrief | null;
  fixed_at: string | null;
  fixed_by: string;
  fix: FixKind | '';
  fix_note: string;
  new_item: ItemBrief | null;
  label?: TagLabel | null;
}

export interface CartBrief {
  id: number;
  kind: CartKind;
  label: string;
  items: number;
}

export interface Carts {
  pr: CartBrief | null;
  relocate: CartBrief | null;
}

export interface Today {
  day: DaySummary | null;
  run: RunSummary | null;
  sections: Section[];
  pending: Issue[];
  /** A manager may start an inventory (a scan never starts one). */
  can_start?: boolean;
  carts: Carts;
  server_now: string;
}

export interface DaySection extends Section {
  complete: boolean;
  state: SectionState;
  counted: number;
  expected: number | null;
  expected_day: string | null;
  runs: RunSummary[];
}

export interface DayDetail extends DaySummary {
  sections: DaySection[];
  tally: { kind: IssueKind; label: string; n: number }[];
  issues: Issue[];
}

export interface MissingRow {
  sku: string;
  title: string;
  location: string;
  price: string;
  retail: string | null;
  cost: string | null;
  listed_at: string | null;
  status: string;
}

export interface CountReport extends DaySummary {
  already: number;
  odd: number;
  unknown: number;
  missing_count: number;
  missing_price_total: string;
  missing_retail_total: string;
  missing_cost_total: string;
  shrink_pct: number;
  missing: MissingRow[];
  sold_meanwhile: MissingRow[];
  odd_items: { sku: string; title: string; status: string; location: string }[];
  unknown_codes: string[];
}

const B = '/stocktake';

// --- the scan screen ---

export async function getToday(): Promise<Today> {
  return (await api.get<Today>(`${B}/today/`)).data;
}

export async function startRun(sectionId: number): Promise<{ run: RunSummary; day: DaySummary }> {
  return (await api.post(`${B}/runs/`, { section_id: sectionId })).data;
}

/** Send a batch of scans. Safe to retry: the server remembers each client_id. */
export async function postScans(
  runId: number,
  scans: ScanPost[],
): Promise<{ results: ScanResult[]; run: RunSummary; day: DaySummary }> {
  return (await api.post(`${B}/runs/${runId}/scans/`, { scans }, { timeout: 15000 })).data;
}

export async function stopRun(
  runId: number,
  outcome: 'complete' | 'partial' | 'bad',
  note?: string,
): Promise<{ run: RunSummary; day: DaySummary }> {
  return (await api.post(`${B}/runs/${runId}/stop/`, { outcome, note })).data;
}

export async function updateRun(
  runId: number,
  patch: { note?: string; bad?: boolean; section_complete?: boolean },
): Promise<RunSummary> {
  return (await api.patch<RunSummary>(`${B}/runs/${runId}/`, patch)).data;
}

/** Remove a session for good, with its scans and problems (Super User). */
export async function deleteRun(runId: number): Promise<void> {
  await api.delete(`${B}/runs/${runId}/`);
}

/** Remove a whole day's count for good (Super User). */
export async function deleteDay(id: number): Promise<void> {
  await api.delete(`${B}/counts/${id}/`);
}

export async function getRunScans(runId: number): Promise<{ run: RunSummary; scans: ScanResult[] }> {
  return (await api.get(`${B}/runs/${runId}/scans/`)).data;
}

export async function removeScan(scanId: number): Promise<ScanResult> {
  return (await api.post<ScanResult>(`${B}/scans/${scanId}/remove/`)).data;
}

export async function restoreScan(scanId: number): Promise<ScanResult> {
  return (await api.post<ScanResult>(`${B}/scans/${scanId}/restore/`)).data;
}

/** My cart is full: start the next one. */
export async function newCart(kind: CartKind): Promise<CartBrief> {
  return (await api.post<CartBrief>(`${B}/carts/`, { kind })).data;
}

export async function getCarts(): Promise<Carts> {
  return (await api.get<Carts>(`${B}/carts/`)).data;
}

// --- problems ---

export async function answerIssue(
  issueId: number,
  body: { action: IssueAction; detail?: string; target_section_id?: number | null },
): Promise<Issue> {
  return (await api.patch<Issue>(`${B}/issues/${issueId}/`, body)).data;
}

export async function reportIssue(body: {
  run_id: number;
  kind: IssueKind;
  action: IssueAction;
  scan_id?: number | null;
  detail?: string;
  target_section_id?: number | null;
}): Promise<Issue> {
  return (await api.post<Issue>(`${B}/issues/`, body)).data;
}

/** ``count``: one inventory's id, ``'all'``, or nothing for the latest inventory. */
export async function listFixIssues(show: 'open' | 'fixed' | 'all' = 'open', count?: number | 'all'): Promise<Issue[]> {
  return (await api.get<Issue[]>(`${B}/issues/`, { params: { show, count } })).data;
}

/** PR Fix-it's inventory picker: the latest first, then earlier ones with problems still open. */
export interface FixitInventory {
  id: number;
  name: string;
  day: string | null;
  days_active: string[];
  stage: InventoryStage;
  open: number;
  latest: boolean;
}

export async function listFixitInventories(): Promise<FixitInventory[]> {
  return (await api.get<FixitInventory[]>(`${B}/fixit/inventories/`)).data;
}

export async function fixIssue(
  issueId: number,
  body: {
    fix: FixKind;
    title?: string;
    price?: string;
    retail?: string;
    item_id?: number;
    product_id?: number;
    reason?: ShrinkReason;
    salvage_price?: string;
    note?: string;
  },
): Promise<{ issue: Issue; label: TagLabel | null }> {
  return (await api.post(`${B}/issues/${issueId}/fix/`, body)).data;
}

/** PR Fix-it scan (inventory_effort Phase 2): fixed when the fix is certain, else which problem needs an answer. */
export interface ScanFixResult {
  status: 'fixed' | 'needs_input' | 'no_problem' | 'unknown';
  message: string;
  fix?: FixKind;
  /** True when the fix wants a new tag printed now. */
  print?: boolean;
  label?: TagLabel | null;
  issue?: Issue;
  item?: ItemBrief | null;
}

export async function scanFix(code: string, count?: number): Promise<ScanFixResult> {
  return (await api.post<ScanFixResult>(`${B}/fixit/scan/`, { code, count })).data;
}

/** A product to answer a "no tag" or "wrong title" problem with. */
export interface ProductOption {
  product_id: number;
  title: string;
  brand: string;
  product_number: string;
  price: string | null;
  retail: string | null;
  /** Items of this product the open inventory has not found yet (potential shrink). */
  not_found: number;
  claim_item_id: number | null;
  claim_sku: string | null;
  can_copy: boolean;
}

export async function fixitProducts(q: string, issueId: number): Promise<ProductOption[]> {
  return (await api.get<ProductOption[]>(`${B}/fixit/products/`, { params: { q, issue: issueId } })).data;
}

export async function reopenIssue(issueId: number): Promise<Issue> {
  return (await api.post<Issue>(`${B}/issues/${issueId}/reopen/`)).data;
}

export async function searchItems(q: string): Promise<ItemBrief[]> {
  return (await api.get<ItemBrief[]>(`${B}/search/`, { params: { q } })).data;
}

// --- sections (Super User) ---

export async function listSections(): Promise<Section[]> {
  return (await api.get<Section[]>(`${B}/sections/`)).data;
}

export async function addSection(name: string): Promise<Section> {
  return (await api.post<Section>(`${B}/sections/`, { name })).data;
}

export async function updateSection(id: number, patch: Partial<Pick<Section, 'name' | 'order' | 'is_active'>>): Promise<Section> {
  return (await api.patch<Section>(`${B}/sections/${id}/`, patch)).data;
}

// --- overview and report (managers) ---

export async function listDays(): Promise<DaySummary[]> {
  return (await api.get<DaySummary[]>(`${B}/counts/`)).data;
}

export async function getDay(id: number): Promise<DayDetail> {
  return (await api.get<DayDetail>(`${B}/counts/${id}/`)).data;
}

export async function closeDay(id: number): Promise<DaySummary> {
  return (await api.post<DaySummary>(`${B}/counts/${id}/close/`)).data;
}

export async function reopenDay(id: number): Promise<DaySummary> {
  return (await api.post<DaySummary>(`${B}/counts/${id}/reopen/`)).data;
}

export async function getCountReport(id: number): Promise<CountReport> {
  return (await api.get<CountReport>(`${B}/counts/${id}/report/`)).data;
}

export function countReportCsvUrl(id: number): string {
  return `/api/stocktake/counts/${id}/report.csv`;
}

/** Shown to the person: the server's own words when it gave any. */
export function apiMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

// --- potential shrink (inventory_effort Phase 3, managers) ---

/** ``sold_online``: not true shrink, no price, not a sale (owner, 2026-10-06). */
export type ShrinkOutcome = 'back_stock' | 'owner_took' | 'sold_generic' | 'sold_online' | 'stolen' | 'broken' | 'scrap';
export type ShrinkGroupBy = 'order' | 'product' | 'vendor' | 'category';

export interface ShrinkMoney {
  n: number;
  price: string;
  retail: string;
}

export interface ShrinkRow {
  id: number;
  sku: string;
  title: string;
  order: string;
  vendor: string;
  category: string;
  subcategory: string;
  price: string;
  retail: string | null;
  checked_in: string | null;
  last_seen: string | null;
  outcome: ShrinkOutcome | '';
  note: string;
  product_id: number;
  location: string;
}

export interface ShrinkList {
  count: { id: number; name: string; status: 'open' | 'closed' };
  totals: Record<'open' | ShrinkOutcome, ShrinkMoney>;
  filtered: { n: number; price: string; retail: string };
  page: number;
  page_size: number;
  pages: number;
  rows: ShrinkRow[];
  outcomes: { key: ShrinkOutcome; label: string }[];
  ages: { key: string; label: string }[];
  price_bands: { key: string; label: string }[];
}

/** List filters; ``outcome`` is ``open`` (default), ``marked``, ``all`` or one outcome. */
export interface ShrinkFilter {
  q?: string;
  outcome?: string;
  vendor?: string;
  order?: string;
  category?: string;
  subcategory?: string;
  product?: number;
  age?: string;
  price_band?: string;
  /** Price as % of retail bucket (``u20``, ``20``, … ``60``, ``none``). */
  pct?: string;
  /** ``missing`` (default: not found) or ``counted`` (the report's items). */
  scope?: 'missing' | 'counted';
  /** With ``scope: 'counted'``: who counted it (user id). */
  person?: string | number;
}

export interface ShrinkGroup {
  key: string | number;
  label: string;
  expected: number;
  missing: number;
  open: number;
  missing_pct: number;
  price: string;
  retail: string;
  open_price: string;
  outcomes: Partial<Record<ShrinkOutcome, number>>;
}

export async function getShrinkList(countId: number, params: ShrinkFilter & { sort?: string; page?: number; page_size?: number }): Promise<ShrinkList> {
  return (await api.get<ShrinkList>(`${B}/counts/${countId}/shrink/`, { params })).data;
}

export async function getShrinkGroups(countId: number, by: ShrinkGroupBy): Promise<ShrinkGroup[]> {
  return (await api.get<ShrinkGroup[]>(`${B}/counts/${countId}/shrink/groups/`, { params: { by } })).data;
}

export async function markShrink(
  countId: number,
  body: { outcome: ShrinkOutcome; note?: string; item_ids?: number[]; filter?: ShrinkFilter; group?: { by: ShrinkGroupBy; key: string | number } },
): Promise<{ marked: number; batch: string; outcome?: ShrinkOutcome }> {
  return (await api.post(`${B}/counts/${countId}/shrink/mark/`, body)).data;
}

export async function unmarkShrink(countId: number, body: { batch?: string; item_ids?: number[] }): Promise<{ unmarked: number }> {
  return (await api.post(`${B}/counts/${countId}/shrink/unmark/`, body)).data;
}

/** Downloads the filtered not-found list as CSV (through the API, so the sign-in goes with it). */
export async function downloadShrinkCsv(countId: number, filter: ShrinkFilter): Promise<void> {
  const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== ''));
  const res = await api.get(`${B}/counts/${countId}/shrink.csv`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-${countId}-${filter.scope === 'counted' ? 'counted' : 'not-found'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- the inventory report (inventory_effort Phase 4, managers) ---

export type BreakdownBy = 'category' | 'subcategory' | 'vendor' | 'order' | 'age' | 'pct' | 'price_band' | 'person';

export interface InventoryPerson {
  user_id: number | null;
  name: string;
  runs: number;
  bad_runs: number;
  hours: number;
  items: number;
  price: string;
  retail: string;
  items_per_hour: number | null;
  problems: number;
}

export interface InventorySummary {
  id: number;
  name: string;
  status: 'open' | 'closed';
  day: string | null;
  started_at: string;
  closed_at: string | null;
  counted: { n: number; price: string; retail: string; price_pct_of_retail: number | null };
  not_found: { n: number; price: string; retail: string };
  expected: number;
  coverage_pct: number | null;
  scans: number;
  runs: number;
  bad_runs: number;
  hours: number;
  problems: number;
  fixed: number;
  by_person: InventoryPerson[];
  breakdowns: BreakdownBy[];
  pct_buckets: { key: string; label: string }[];
}

export interface BreakdownSide {
  n: number;
  price: string;
  retail: string;
}

export interface BreakdownRow {
  key: string | number;
  label: string;
  counted: BreakdownSide;
  not_found: BreakdownSide;
}

export interface PriceHistogram {
  max: number;
  bins: { counted: number[]; not_found: number[] };
  no_retail: { counted: number; not_found: number };
}

export async function getInventorySummary(countId: number): Promise<InventorySummary> {
  return (await api.get<InventorySummary>(`${B}/counts/${countId}/summary/`)).data;
}

export async function getInventoryBreakdown(countId: number, by: BreakdownBy): Promise<BreakdownRow[]> {
  return (await api.get<BreakdownRow[]>(`${B}/counts/${countId}/breakdown/`, { params: { by } })).data;
}

export async function getPriceHistogram(countId: number): Promise<PriceHistogram> {
  return (await api.get<PriceHistogram>(`${B}/counts/${countId}/histogram/`)).data;
}

// --- Inventories (inventory_effort Phase 6) -------------------------------------------------------

export type InventoryStage = 'in_progress' | 'done';

/** One row of the Inventories list. */
export interface InventoryRow {
  id: number;
  name: string;
  day: string | null;
  stage: InventoryStage;
  status: 'open' | 'closed';
  latest: boolean;
  started_at: string;
  started_by: string;
  closed_at: string | null;
  closed_by: string;
  days_active: string[];
  counted: { n: number; price: string; retail: string; price_pct_of_retail: number | null };
  not_found: { n: number; price: string; retail: string };
  expected: number;
  coverage_pct: number | null;
  hours: number;
  scans: number;
  sessions: number;
  people: string[];
  sections_done: number;
  sections_total: number;
  to_fix: number;
  /** Not-found items the owner has estimated (any outcome), and how many as back stock. */
  estimated: number;
  back_stock: number;
}

export async function listInventories(): Promise<InventoryRow[]> {
  return (await api.get<InventoryRow[]>(`${B}/inventories/`)).data;
}

export async function startInventory(name?: string): Promise<DaySummary> {
  return (await api.post<DaySummary>(`${B}/counts/start/`, { name })).data;
}

export interface EstimateMoney {
  n: number;
  price: string;
  retail: string;
}

export interface OrderEstimate {
  id: number;
  order_number: string;
  vendor: string;
  ordered_date: string | null;
  delivered_date: string | null;
  status: string;
  cost: string;
  /** Sold so far (all time). */
  sold: string;
  /** Found by the count and still unsold. */
  found: EstimateMoney;
  /** Found by the count, sold since (already in ``sold``). */
  found_sold_since: number;
  /** Not found, estimated as back stock by the owner, still unsold. */
  back_stock: EstimateMoney;
}

export interface OrderEstimates {
  count: { id: number; name: string; stage: InventoryStage };
  orders: OrderEstimate[];
  /** Found items with no order. */
  no_order: { n: number; price: string };
  back_stock_marked: number;
}

export async function getOrderEstimates(countId: number): Promise<OrderEstimates> {
  return (await api.get<OrderEstimates>(`${B}/counts/${countId}/orders/`)).data;
}

// --- Data quality (inventory_effort Phase 7) ------------------------------------------------------

export interface QualityExample {
  id: number | null;
  sku: string;
  title: string;
  status: string;
  price: string | null;
  retail: string | null;
  order: string;
  detail: string;
}

export interface QualityRequest {
  id: number;
  status: 'pending' | 'approved' | 'running' | 'applied' | 'failed' | 'rejected' | 'undone' | string;
  created_at: string;
}

export interface QualityFinding {
  key: string;
  title: string;
  what: string;
  n: number;
  /** $ at price of the items it covers, when that means something. */
  money: string | null;
  examples: QualityExample[];
  /** request: a bulk fix the Super User approves on Requests; rule / by_hand / pr_fixit / none: how it is handled. */
  fix: { kind: 'request' | 'rule' | 'by_hand' | 'pr_fixit' | 'none'; label?: string; how?: string; request_kind?: string };
  /** The data-quality register ID (`.ai/extended/data-quality.md`). */
  register: string;
  /** The latest Requests for this fix (newest first). */
  requests?: QualityRequest[];
}

export async function getQualityFindings(countId: number): Promise<{ count: { id: number; name: string }; findings: QualityFinding[] }> {
  return (await api.get(`${B}/counts/${countId}/quality/`)).data;
}

export async function stageQualityRequest(countId: number, key: string): Promise<{ id: number; status: string }> {
  return (await api.post(`${B}/counts/${countId}/quality/request/`, { key })).data;
}
