import type { PaginatedResponse } from '../types/index';
import type {
  DashboardMetrics,
  DashboardSalesGoal,
  DashboardDepartmentGoal,
  DepartmentGoalKey,
  Register,
  Drawer,
  DeliveryAvailability,
  DeliveryDayDetail,
  DeliveryDaySummary,
  DeliveryJob,
  DeliveryJobItem,
  DeliveryRun,
} from '../types/pos.types';
import api from './client';

export type { Register, Drawer, DeliveryAvailability, DeliveryJob, DeliveryRun };

export interface RevenueGoal {
  id: number;
  [key: string]: unknown;
}

export interface Cart {
  id: number;
  [key: string]: unknown;
}

// Registers CRUD
export function getRegisters(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Register> }> {
  return api.get<PaginatedResponse<Register>>('/pos/registers/', { params });
}

export function getRegister(id: number): Promise<{ data: Register }> {
  return api.get<Register>(`/pos/registers/${id}/`);
}

export function createRegister(data: Record<string, unknown>): Promise<{ data: Register }> {
  return api.post<Register>('/pos/registers/', data);
}

export function updateRegister(id: number, data: Record<string, unknown>): Promise<{ data: Register }> {
  return api.patch<Register>(`/pos/registers/${id}/`, data);
}

export function deleteRegister(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/registers/${id}/`);
}

// Revenue goals CRUD
export function getRevenueGoals(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<RevenueGoal> }> {
  return api.get<PaginatedResponse<RevenueGoal>>('/pos/revenue-goals/', { params });
}

export function getRevenueGoal(id: number): Promise<{ data: RevenueGoal }> {
  return api.get<RevenueGoal>(`/pos/revenue-goals/${id}/`);
}

export function createRevenueGoal(data: Record<string, unknown>): Promise<{ data: RevenueGoal }> {
  return api.post<RevenueGoal>('/pos/revenue-goals/', data);
}

export function updateRevenueGoal(id: number, data: Record<string, unknown>): Promise<{ data: RevenueGoal }> {
  return api.patch<RevenueGoal>(`/pos/revenue-goals/${id}/`, data);
}

export function deleteRevenueGoal(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/revenue-goals/${id}/`);
}

// Drawers
export function getDrawers(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Drawer> }> {
  return api.get<PaginatedResponse<Drawer>>('/pos/drawers/', { params });
}

export function openDrawer(data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>('/pos/drawers/', data);
}

export function drawerHandoff(id: number, data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/handoff/`, data);
}

export function drawerTakeover(id: number, data?: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/takeover/`, data ?? {});
}

export function closeDrawer(id: number, data: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/close/`, data);
}

export function reopenDrawer(id: number, data?: Record<string, unknown>): Promise<{ data: Drawer }> {
  return api.post<Drawer>(`/pos/drawers/${id}/reopen/`, data ?? {});
}

export function cashDrop(drawerId: number, data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post(`/pos/drawers/${drawerId}/drop/`, data);
}

// Supplemental
export function getSupplemental(): Promise<{ data: unknown }> {
  return api.get('/pos/supplemental/');
}

export function drawFromSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/draw/', data);
}

export function returnToSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/return/', data);
}

export function auditSupplemental(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/audit/', data);
}

export function getSupplementalTransactions(): Promise<{ data: unknown[] }> {
  return api.get('/pos/supplemental/transactions/');
}

/** Create `SupplementalDrawer` for a work location when missing (Manager+). */
export function bootstrapSupplemental(data?: { location?: number }): Promise<{ data: unknown }> {
  return api.post('/pos/supplemental/bootstrap/', data ?? {});
}

// Bank transactions
export function getBankTransactions(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<unknown> }> {
  return api.get<PaginatedResponse<unknown>>('/pos/bank-transactions/', { params });
}

export function createBankTransaction(data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.post('/pos/bank-transactions/', data);
}

export function updateBankTransaction(id: number, data: Record<string, unknown>): Promise<{ data: unknown }> {
  return api.patch(`/pos/bank-transactions/${id}/`, data);
}

export function deleteBankTransaction(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/bank-transactions/${id}/`);
}

export function completeBankTransaction(id: number): Promise<{ data: unknown }> {
  return api.patch(`/pos/bank-transactions/${id}/complete/`);
}

// Carts
export function createCart(data: Record<string, unknown>): Promise<{ data: Cart }> {
  return api.post<Cart>('/pos/carts/', data);
}

export function getCart(id: number): Promise<{ data: Cart }> {
  return api.get<Cart>(`/pos/carts/${id}/`);
}

export function updateCart(id: number, data: Record<string, unknown>): Promise<{ data: Cart }> {
  return api.patch<Cart>(`/pos/carts/${id}/`, data);
}

export function addItemToCart(cartId: number, sku: string): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-item/`, { sku });
}

export function addManualLineToCart(
  cartId: number,
  body: { description: string; unit_price?: number | string; quantity?: number },
): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-manual-line/`, body);
}

export function addDiscountToCart(
  cartId: number,
  body: { amount: number | string; reason?: string; target_line_id?: number | null },
): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-discount/`, body);
}

export function addDeliveryToCart(
  cartId: number,
  body: {
    tier: '5mi' | '10mi';
    customer_name: string;
    phone: string;
    address: string;
    items_delivered: string;
    availability_id?: number | null;
    schedule_later?: boolean;
    notes?: string;
    is_apt?: boolean;
    unit?: string;
    item_count?: number;
    cart_line_ids?: number[];
    replace_line_id?: number;
    distance_miles?: string | number;
    distance_mode?: string;
    lat?: number;
    lon?: number;
    display_name?: string;
  },
): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-delivery/`, body);
}

export interface DeliveryAddressSuggestion {
  display_name: string;
  address_line: string;
  city: string;
  state: string;
  postcode: string;
  lat: number;
  lon: number;
  store_label: string;
  distance_miles: string;
  distance_mode?: 'driving' | 'straight_line';
  tier: '5mi' | '10mi' | null;
  fee: string | null;
  too_far: boolean;
}

export function suggestDeliveryAddresses(
  q: string,
): Promise<{ data: { results: DeliveryAddressSuggestion[]; detail?: string } }> {
  return api.get('/pos/delivery/address-suggest/', { params: { q } });
}

export function quoteDeliveryDistance(body: {
  lat: number;
  lon: number;
}): Promise<{
  data: {
    distance_miles: string;
    tier: '5mi' | '10mi' | null;
    fee: string | null;
    too_far: boolean;
    store_label: string;
  };
}> {
  return api.post('/pos/delivery/quote/', body);
}

export function getDeliveryAvailabilities(
  params?: Record<string, unknown>,
): Promise<{ data: DeliveryAvailability[] }> {
  return api.get<DeliveryAvailability[]>('/pos/delivery-availabilities/', { params });
}

export function createDeliveryAvailability(
  data: Partial<DeliveryAvailability> & {
    date: string;
    time_start: string;
    time_end: string;
  },
): Promise<{ data: DeliveryAvailability }> {
  return api.post<DeliveryAvailability>('/pos/delivery-availabilities/', data);
}

export function updateDeliveryAvailability(
  id: number,
  data: Partial<DeliveryAvailability>,
): Promise<{ data: DeliveryAvailability }> {
  return api.patch<DeliveryAvailability>(`/pos/delivery-availabilities/${id}/`, data);
}

export function deleteDeliveryAvailability(id: number): Promise<void> {
  return api.delete(`/pos/delivery-availabilities/${id}/`);
}

export function getDeliveryDays(
  params?: Record<string, unknown>,
): Promise<{ data: PaginatedResponse<DeliveryDaySummary> }> {
  return api.get<PaginatedResponse<DeliveryDaySummary>>('/pos/delivery-days/', { params });
}

export function getDeliveryDay(id: number): Promise<{ data: DeliveryDayDetail }> {
  return api.get<DeliveryDayDetail>(`/pos/delivery-days/${id}/`);
}

export function createDeliveryDay(
  data: Record<string, unknown>,
): Promise<{ data: DeliveryDayDetail }> {
  return api.post<DeliveryDayDetail>('/pos/delivery-days/', data);
}

export function updateDeliveryDay(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: DeliveryDayDetail }> {
  return api.patch<DeliveryDayDetail>(`/pos/delivery-days/${id}/`, data);
}

export function archiveDeliveryDay(id: number, reason = ''): Promise<void> {
  return api.delete(`/pos/delivery-days/${id}/`, { data: { reason } });
}

export function searchDeliveries(
  params?: Record<string, unknown>,
): Promise<{ data: PaginatedResponse<DeliveryJob> }> {
  return api.get<PaginatedResponse<DeliveryJob>>('/pos/deliveries/', { params });
}

export function getDelivery(id: number): Promise<{ data: DeliveryJob }> {
  return api.get<DeliveryJob>(`/pos/deliveries/${id}/`);
}

export function createDelivery(data: Record<string, unknown>): Promise<{ data: DeliveryJob }> {
  return api.post<DeliveryJob>('/pos/deliveries/', data);
}

export function updateDelivery(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: DeliveryJob }> {
  return api.patch<DeliveryJob>(`/pos/deliveries/${id}/`, data);
}

export function archiveDelivery(id: number, reason = ''): Promise<void> {
  return api.delete(`/pos/deliveries/${id}/`, { data: { reason } });
}

export function restoreDelivery(
  id: number,
  reason = '',
): Promise<{ data: DeliveryJob }> {
  return api.post<DeliveryJob>(`/pos/deliveries/${id}/restore/`, { reason });
}

export function assignDeliveryDay(
  id: number,
  dayId: number,
  reason = '',
): Promise<{ data: DeliveryJob }> {
  return api.post<DeliveryJob>(`/pos/deliveries/${id}/assign-day/`, { day: dayId, reason });
}

export function getDeliveryDayRun(dayId: number): Promise<{ data: DeliveryRun }> {
  return api.get<DeliveryRun>(`/pos/delivery-days/${dayId}/run/`);
}

export function startDeliveryDayRun(dayId: number): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-days/${dayId}/start-run/`, {});
}

export function recordDeliveryStopContactAttempt(
  stopId: number,
  data: { channel: string; action: string; note?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/contact-attempt/`, data);
}

export function setDeliveryStopDisposition(
  stopId: number,
  data: { disposition: string; note?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/disposition/`, data);
}

export function excludeDeliveryStopUnconfirmed(
  stopId: number,
  data: { reason?: string; clear?: boolean },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/exclude-unconfirmed/`, data);
}

export function scanDeliveryStopItem(
  itemId: number,
  data: { scanned_code?: string; sku?: string; client_scan_id?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stop-items/${itemId}/scan/`, data);
}

export function skipDeliveryStopItemVerification(
  itemId: number,
  data: { reason: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stop-items/${itemId}/skip/`, data);
}

export function setDeliveryStopItemLoaded(
  itemId: number,
  loaded = true,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stop-items/${itemId}/load/`, { loaded });
}

export function setDeliveryStopItemPhotoException(
  itemId: number,
  data: { reason: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stop-items/${itemId}/photo-exception/`, data);
}

export function closeDeliveryRunTruck(runId: number): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${runId}/close-truck/`, {});
}

export function setDeliveryRunDepartureOverride(
  runId: number,
  data: { reason: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${runId}/departure-override/`, data);
}

export function addDeliveryItem(
  id: number,
  data: { description: string; quantity?: number; sku?: string; reason?: string },
): Promise<{ data: DeliveryJobItem }> {
  return api.post<DeliveryJobItem>(`/pos/deliveries/${id}/items/`, data);
}

export function removeDeliveryItem(
  id: number,
  itemId: number,
  reason = '',
): Promise<{ data: DeliveryJobItem }> {
  return api.post<DeliveryJobItem>(`/pos/deliveries/${id}/items/${itemId}/remove/`, { reason });
}

export function getDeliveryJobs(
  params?: Record<string, unknown>,
): Promise<{ data: DeliveryJob[] }> {
  return api.get<DeliveryJob[]>('/pos/delivery-jobs/', { params });
}

export function createDeliveryJob(data: {
  customer_name: string;
  phone: string;
  address: string;
  items_delivered: string;
  is_apt?: boolean;
  unit?: string;
  notes?: string;
  tier?: string;
  fee?: string | number;
  availability_id?: number;
  schedule_later?: boolean;
  cart_id?: number;
  cart_line_ids?: number[];
  item_count?: number;
  distance_miles?: string | number;
  distance_mode?: string;
}): Promise<{ data: DeliveryJob & { customer_schedule_message?: string } }> {
  return api.post('/pos/delivery-jobs/', data);
}

export function optimizeDeliveryRoute(addresses: string[]): Promise<{
  data: {
    ordered_addresses: string[];
    optimized: boolean;
    maps_url: string | null;
    waypoint_cap: number;
    truncated: number;
    store_address: string;
  };
}> {
  return api.post('/pos/delivery/optimize-route/', { addresses });
}

export function getDeliveryRun(date: string): Promise<{ data: DeliveryRun | null }> {
  return api.get<DeliveryRun | null>('/pos/delivery-runs/', { params: { date } });
}

export function startDeliveryRun(data: {
  date: string;
  availability_id?: number | null;
}): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>('/pos/delivery-runs/', data);
}

export function getDeliveryRunById(id: number): Promise<{ data: DeliveryRun }> {
  return api.get<DeliveryRun>(`/pos/delivery-runs/${id}/`);
}

export function setDeliveryRunPhase(id: number, phase: string): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/phase/`, { phase });
}

export function beginDeliveryRoute(id: number): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/begin-route/`);
}

export function optimizeDeliveryRun(
  id: number,
  optimize = true,
  baseRevision?: number,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/optimize/`, {
    optimize,
    ...(baseRevision != null ? { base_revision: baseRevision } : {}),
  });
}

export function reorderDeliveryRun(
  id: number,
  stop_ids: number[],
  baseRevision?: number,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/reorder/`, {
    stop_ids,
    ...(baseRevision != null ? { base_revision: baseRevision } : {}),
  });
}

export function finishDeliveryRun(
  id: number,
  data?: { force?: boolean; reason?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/finish/`, data || {});
}

export function uploadDeliveryAttachment(runId: number, form: FormData): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${runId}/attachments/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deleteDeliveryAttachment(
  runId: number,
  attachmentId: number,
): Promise<{ data: DeliveryRun }> {
  return api.delete<DeliveryRun>(`/pos/delivery-runs/${runId}/attachments/${attachmentId}/`);
}

export function markDeliveryStopLoaded(stopId: number, loaded = true): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/load/`, { loaded });
}

export function markDeliveryStopSecured(stopId: number, secured = true): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/secure/`, { secured });
}

export function addDeliveryStopCall(
  stopId: number,
  data: { result: string; note?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/call/`, data);
}

export function holdDeliveryStop(stopId: number, reason?: string): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/hold/`, { reason: reason || '' });
}

export function releaseDeliveryStop(stopId: number): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/release/`);
}

export function completeDeliveryStop(
  stopId: number,
  data?: { override?: boolean; override_reason?: string },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/complete/`, data || {});
}

export function markDeliveryStopContactPresent(
  stopId: number,
  present = true,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/contact-present/`, { present });
}

export function markDeliveryStopDelivered(
  stopId: number,
  delivered = true,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/delivered/`, { delivered });
}

export function markDeliveryRunReturnedToStore(id: number): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-runs/${id}/return-store/`);
}

export function reconcileDeliveryStopReturn(
  stopId: number,
  data: {
    unloaded?: boolean;
    items_stored?: boolean;
    issue_code?: string;
    issue_notes?: string;
    reconcile?: boolean;
  },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/return-reconcile/`, data);
}

export function reportDeliveryStopIssue(
  stopId: number,
  data: { issue_code: string; note: string; hold?: boolean },
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/report-issue/`, data);
}

export function rescheduleDeliveryJob(
  jobId: number,
  data: { availability_id: number; notes?: string },
): Promise<{ data: { job: DeliveryJob; run?: DeliveryRun } }> {
  return api.post(`/pos/delivery-jobs/${jobId}/reschedule/`, data);
}

export function updateDeliveryStopNotes(stopId: number, notes: string): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/notes/`, { notes });
}

export function scanVerifyDeliveryStop(
  stopId: number,
  sku: string,
): Promise<{ data: DeliveryRun }> {
  return api.post<DeliveryRun>(`/pos/delivery-stops/${stopId}/scan-verify/`, { sku });
}

export function appendDeliveryJobAddress(
  jobId: number,
  data: { address: string; is_apt?: boolean; unit?: string; reason?: string },
): Promise<{ data: DeliveryRun | { ok: boolean; job_id: number } }> {
  return api.post(`/pos/delivery-jobs/${jobId}/append-address/`, data);
}

export function updateDeliveryJob(
  id: number,
  data: {
    status?: string;
    notes?: string;
    availability?: number;
    availability_id?: number;
    customer_name?: string;
    phone?: string;
  },
): Promise<{ data: DeliveryJob }> {
  return api.patch<DeliveryJob>(`/pos/delivery-jobs/${id}/`, data);
}

export function addResaleCopyToCart(
  cartId: number,
  body: { source_item_id: number } | { sku: string },
): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/add-resale-copy/`, body);
}

export function updateCartLine(
  cartId: number,
  lineId: number,
  data: Record<string, unknown>,
): Promise<{ data: Cart }> {
  return api.patch<Cart>(`/pos/carts/${cartId}/lines/${lineId}/`, data);
}

export function removeCartLine(cartId: number, lineId: number): Promise<{ data: unknown }> {
  return api.delete(`/pos/carts/${cartId}/lines/${lineId}/`);
}

export function completeCart(cartId: number, data: Record<string, unknown>): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/complete/`, data);
}

export function voidCart(cartId: number): Promise<{ data: Cart }> {
  return api.post<Cart>(`/pos/carts/${cartId}/void/`);
}

export function getCarts(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Cart> }> {
  return api.get<PaginatedResponse<Cart>>('/pos/carts/', { params });
}

// Dashboard
export function getDashboardMetrics(): Promise<{ data: DashboardMetrics }> {
  return api.get<DashboardMetrics>('/pos/dashboard/metrics/');
}

export function upsertDashboardSalesGoal(data: {
  amount: string;
  description: string;
}): Promise<{ data: DashboardSalesGoal }> {
  return api.post<DashboardSalesGoal>('/pos/dashboard/sales-goal/', data);
}

export function upsertDashboardDepartmentGoal(data: {
  department: DepartmentGoalKey;
  value: string;
  description: string;
  schedule?: {
    weekdays: number[];
    audits_per_day: number;
  };
}): Promise<{ data: DashboardDepartmentGoal }> {
  return api.post<DashboardDepartmentGoal>('/pos/dashboard/department-goals/', data);
}

export function getDashboardAlerts(): Promise<{ data: unknown[] }> {
  return api.get('/pos/dashboard/alerts/');
}

// ── Historical Revenue ─────────────────────────────────────────────────────────

export interface HistoricalRevenueDataPoint {
  period: string;
  source_db: 'db1' | 'db2' | 'db3';
  total: string;
  transaction_count: number;
}

export interface HistoricalRevenueSummary {
  db1_total: string;
  db2_total: string;
  db3_total: string;
  db1_transactions: number;
  db2_transactions: number;
  db3_transactions: number;
}

export interface HistoricalRevenueResponse {
  period: string;
  data: HistoricalRevenueDataPoint[];
  summary: HistoricalRevenueSummary;
}

export function getHistoricalRevenue(params?: {
  period?: 'monthly' | 'yearly' | 'weekly';
  sources?: 'all' | 'db3_only' | 'db1_db2_only';
  years?: string;
}): Promise<{ data: HistoricalRevenueResponse }> {
  return api.get<HistoricalRevenueResponse>('/pos/historical-revenue/', { params });
}
