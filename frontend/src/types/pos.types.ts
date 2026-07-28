/**
 * Payment method choices
 */
export type PaymentMethod = 'cash' | 'card' | 'split';

/**
 * Device type for POS device identity (persisted in localStorage).
 */
export type POSDeviceType = 'register' | 'manager' | 'online_sales' | 'processing' | 'mobile';

/**
 * Persisted device config so this machine is recognized as a specific terminal/role.
 */
export interface POSDeviceConfig {
  deviceType: POSDeviceType;
  registerId?: number;
  registerName?: string;
  registerCode?: string;
  configuredAt: string;
}

/**
 * Denomination breakdown for cash counts
 */
export interface DenominationBreakdown {
  hundreds: number;
  fifties: number;
  twenties: number;
  tens: number;
  fives: number;
  ones: number;
  quarters: number;
  dimes: number;
  nickels: number;
  pennies: number;
}

export interface Register {
  id: number;
  location: number;
  location_name: string;
  name: string;
  code: string;
  starting_cash: string;
  starting_breakdown: DenominationBreakdown;
  is_active: boolean;
}

export interface DrawerHandoff {
  id: number;
  drawer: number;
  outgoing_cashier: number | null;
  outgoing_cashier_name: string | null;
  incoming_cashier: number | null;
  incoming_cashier_name: string | null;
  counted_at: string;
  count: DenominationBreakdown;
  counted_total: string;
  expected_total: string;
  variance: string;
  notes: string;
}

export interface CashDrop {
  id: number;
  drawer: number;
  amount: DenominationBreakdown;
  total: string;
  dropped_by: number | null;
  dropped_by_name: string | null;
  dropped_at: string;
  notes: string;
}

export interface Drawer {
  id: number;
  register: number;
  register_name: string;
  register_code: string;
  date: string;
  status: 'open' | 'closed';
  current_cashier: number | null;
  current_cashier_name: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  opened_at: string;
  opening_count: DenominationBreakdown;
  opening_total: string;
  closed_by: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
  closing_count: DenominationBreakdown | null;
  closing_total: string | null;
  cash_sales_total: string;
  expected_cash: string | null;
  variance: string | null;
  handoffs: DrawerHandoff[];
  drops: CashDrop[];
}

export interface SupplementalDrawer {
  id: number;
  location: number;
  location_name: string;
  current_balance: DenominationBreakdown;
  current_total: string;
  last_counted_by: number | null;
  last_counted_by_name: string | null;
  last_counted_at: string | null;
}

export interface SupplementalTransaction {
  id: number;
  supplemental: number;
  transaction_type: 'draw' | 'return' | 'audit_adjustment';
  amount: DenominationBreakdown;
  total: string;
  related_drawer: number | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
  notes: string;
}

export interface BankTransaction {
  id: number;
  location: number;
  transaction_type: 'deposit' | 'change_pickup';
  amount: DenominationBreakdown;
  total: string;
  status: 'pending' | 'completed';
  performed_by: number | null;
  performed_by_name: string | null;
  created_at: string;
  completed_at: string | null;
  notes: string;
}

export interface CartLine {
  id: number;
  cart: number;
  item: number | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  resale_source_sku?: string;
  resale_source_item_id?: number | null;
  line_kind?: 'item' | 'manual' | 'discount' | 'delivery';
  meta?: Record<string, unknown>;
  created_at: string;
}

export interface Receipt {
  id: number;
  cart: number;
  receipt_number: string;
  printed: boolean;
  emailed: boolean;
  created_at: string;
}

export interface Cart {
  id: number;
  drawer: number;
  cashier: number | null;
  cashier_name: string | null;
  customer: number | null;
  status: 'open' | 'completed' | 'voided';
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  payment_method: PaymentMethod;
  cash_tendered: string | null;
  change_given: string | null;
  card_amount: string | null;
  completed_at: string | null;
  created_at: string;
  lines: CartLine[];
  receipt?: Receipt | null;
}

export interface RevenueGoal {
  id: number;
  location: number;
  date: string;
  goal_amount: string;
}

export interface WeeklyDayMetric {
  date: string;
  day: string;
  revenue: string;
  items_sold: number;
  goal?: string;
}

export interface SalesDailyMetric {
  date: string;
  day: string;
  rolling_week_total: string;
  four_week_weekly_avg: string;
  week_start: string;
  is_week_start: boolean;
}

export interface SalesWeeklyRow {
  week_start: string;
  week_end: string;
  week_total: string;
  week_items_sold: number;
  label: string;
  days: WeeklyDayMetric[];
}

export interface DashboardSalesGoal {
  id: number;
  amount: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesMetrics {
  today: string;
  yesterday: string;
  same_weekday_last_week: string;
  goal: DashboardSalesGoal | null;
  daily_last_90_days: SalesDailyMetric[];
  weekly_last_14_weeks: SalesWeeklyRow[];
}

export interface DepartmentPeriodMetric {
  week: string;
  today: string;
}

export interface RestorationMetrics {
  active_jobs: number;
  awaiting_parts: number;
  returns_pending: number;
  week_jobs_done: number;
  today_jobs_done: number;
  week_tested: number;
  week_repairs: number;
  week_assembled: number;
  week_salvaged: number;
  today_tested: number;
  today_repairs: number;
  today_assembled: number;
  today_salvaged: number;
  ready: boolean;
  note?: string;
}

export interface RetailMetrics {
  ready: boolean;
  /** Legacy alias of ``last_grade`` — not a mean of letter grades. */
  average_grade: string | null;
  /** Most recently submitted dashboard-feeding QA grade (overall). */
  last_grade: string | null;
  /** Weekly recurring QA schedule. Monday=0 ... Sunday=6. */
  schedule: RetailQaGoalSchedule;
  grade_goal: string | null;
  week_audits: number;
  week_required: number;
  completed_days: number;
  scheduled_days: number;
  due_days: number;
  /** All scheduled days due through today have hit count + grade. */
  due_goal_met: boolean;
  /** Every scheduled day in the full week has hit count + grade. */
  week_goal_met: boolean;
  note?: string;
}

export interface DepartmentDailyMetric {
  date: string;
  day: string;
  buying: string;
  processing: string;
  restoration: number;
  retail: string | null;
  retail_count?: number;
  retail_required?: number;
  retail_scheduled?: boolean;
  retail_grade_met?: boolean;
  retail_goal_met?: boolean;
  is_future: boolean;
}

export interface DepartmentDailyWeek {
  label: string;
  week_start: string;
  week_end: string;
  /**
   * Retail QA week score: last submitted grade in that week (by submitted_at).
   * Not average, not highest letter.
   */
  retail_week_grade?: string | null;
  retail_week_audits?: number;
  retail_week_required?: number;
  retail_completed_days?: number;
  retail_scheduled_days?: number;
  retail_due_days?: number;
  retail_due_goal_met?: boolean;
  retail_week_goal_met?: boolean;
  days: DepartmentDailyMetric[];
}

export type DepartmentGoalKey = 'buying' | 'processing' | 'restoration' | 'retail';

export interface RetailQaGoalSchedule {
  weekdays: number[];
  audits_per_day: number;
}

export interface DashboardDepartmentGoal {
  id: number;
  department: DepartmentGoalKey;
  value: string;
  description: string;
  schedule?: RetailQaGoalSchedule;
  created_at?: string;
  updated_at?: string;
}

export interface DepartmentMetrics {
  buying: DepartmentPeriodMetric;
  processing: DepartmentPeriodMetric;
  restoration: RestorationMetrics;
  retail: RetailMetrics;
  goals: Partial<Record<DepartmentGoalKey, DashboardDepartmentGoal>>;
  daily_weeks: DepartmentDailyWeek[];
}

export interface DashboardMetrics {
  sales: SalesMetrics;
  department_metrics: DepartmentMetrics;
}

export interface DashboardAlert {
  type: 'time_entries' | 'sick_leave' | 'drawers';
  message: string;
  count: number;
}

export type DeliveryCrewSize = 1 | 2;

export type DeliveryJobStatus =
  | 'needs_scheduling'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface DeliveryAvailability {
  id: number;
  date: string;
  time_start: string;
  time_end: string;
  crew_size: DeliveryCrewSize;
  assigned_to: string;
  notes: string;
  is_active: boolean;
  delivery_count: number;
  items_booked: number;
  planning_disposition?: 'planned' | 'cancelled' | 'not_run';
  location?: number | null;
  primary_driver?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type DeliveryDayDisplayState =
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'not_run';

export interface DeliveryDaySummary {
  id: number;
  date: string;
  time_start: string | null;
  time_end: string | null;
  crew_size: DeliveryCrewSize;
  assigned_to: string;
  notes: string;
  is_active: boolean;
  is_bookable: boolean;
  planning_disposition: 'planned' | 'cancelled' | 'not_run';
  display_state: DeliveryDayDisplayState;
  location_id: number | null;
  primary_driver_id: number | null;
  primary_driver_name: string | null;
  delivery_count: number;
  items_booked: number;
  completed_count: number;
  cancelled_count: number;
  is_test: boolean;
  test_dataset_key: string | null;
  run: {
    id: number;
    status: string;
    phase: string;
    active_seconds: number;
    started_at: string | null;
    ended_at: string | null;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DeliveryDayDetail extends DeliveryDaySummary {
  assignments: Array<{
    id: number;
    user_id: number;
    user_name: string;
    role: string;
    display_order: number;
  }>;
  jobs: DeliveryJob[];
  items: DeliveryJobItem[];
}

export interface DeliveryJobItem {
  id: number;
  job: number;
  sku: string;
  description: string;
  quantity: number;
  position: number;
  is_scannable: boolean;
  is_active: boolean;
  source_cart_line?: number | null;
  removed_at?: string | null;
  remove_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryJob {
  id: number;
  availability: number | null;
  day?: number | null;
  scheduled_date: string | null;
  cart: number | null;
  cart_line: number | null;
  /** POS receipt number when linked to a completed sale. */
  receipt_number?: string | null;
  customer_name: string;
  phone: string;
  address: string;
  /** Sale/original address (unit included when apt). */
  original_address?: string;
  /** Active delivery address (revision if present, else original). */
  delivery_address?: string;
  address_corrected?: boolean;
  is_apt: boolean;
  unit: string;
  items_delivered: string;
  item_count: number;
  items?: DeliveryJobItem[];
  tier: string;
  fee: string;
  distance_miles: string | null;
  distance_mode: string;
  status: DeliveryJobStatus;
  notes: string;
  needs_scheduling?: boolean;
  is_test?: boolean;
  is_archived?: boolean;
  created_by: number | null;
  created_by_name?: string | null;
  availability_time_start?: string | null;
  availability_time_end?: string | null;
  availability_assigned_to?: string | null;
  availability_crew_size?: number | null;
  created_at?: string;
  updated_at?: string;
  customer_schedule_message?: string;
  just_scheduled?: boolean;
}

export type DeliveryRunStatus = 'preparing' | 'en_route' | 'completed';
export type DeliveryRunPhase =
  | 'start'
  | 'calls'
  | 'load'
  | 'truck'
  | 'route'
  | 'active'
  | 'return'
  /** @deprecated Legacy phases remapped by API */
  | 'review';
export type DeliveryContactChannel = 'call' | 'text';
export type DeliveryContactAttemptAction =
  | 'call_placed'
  | 'composer_opened'
  | 'text_marked_sent';
export type DeliveryContactDisposition =
  | 'awaiting_reply'
  | 'confirmed'
  | 'reschedule_requested'
  | 'cancel_requested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'other';
export type DeliveryRunStopState =
  | 'queued'
  | 'next_up'
  | 'on_hold'
  | 'completed'
  | 'failed'
  | 'rescheduled';
export type DeliveryAttachmentKind =
  | 'truck'
  | 'load_item'
  | 'delivery_proof'
  | 'signature'
  | 'issue';

export interface DeliveryRunEvent {
  id: number;
  event_type: string;
  stop_id: number | null;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}
export type DeliveryCallResult =
  | 'answered_will_be_there'
  | 'answered_not_available'
  | 'no_answer'
  | 'voicemail_left'
  | 'text_sent'
  | 'wrong_number'
  | 'other';
export type DeliveryReturnIssueCode =
  | 'no_customer'
  | 'customer_refused'
  | 'could_not_access'
  | 'item_issue'
  | 'other';

export interface DeliveryAttachment {
  id: number;
  kind: DeliveryAttachmentKind;
  stop_id: number | null;
  client_photo_id: string | null;
  url: string;
  filename: string;
  created_at: string;
}

export interface DeliveryCallAttempt {
  id: number;
  result?: DeliveryCallResult;
  channel?: DeliveryContactChannel | string;
  action?: DeliveryContactAttemptAction | string;
  note: string;
  created_at: string;
  created_by: string;
}

export interface DeliveryStopItemScan {
  id: number;
  scanned_code: string;
  client_scan_id: string | null;
  scanned_at: string;
}

export interface DeliveryStopItemPhoto {
  id: number;
  kind: DeliveryAttachmentKind;
  url: string;
  client_photo_id: string | null;
  created_at: string;
}

export interface DeliveryStopItem {
  id: number;
  stop_id: number;
  job_item_id: number | null;
  sku: string;
  description: string;
  quantity: number;
  position: number;
  is_scannable: boolean;
  scan_count: number;
  scans_required: number;
  is_verified: boolean;
  verification_skipped: boolean;
  verification_skip_reason: string;
  loaded_at: string | null;
  has_load_photo: boolean;
  photo_exception: boolean;
  photo_exception_reason: string;
  is_ready: boolean;
  scans: DeliveryStopItemScan[];
  photos: DeliveryStopItemPhoto[];
}

export interface DeliveryContactDispositionOption {
  value: DeliveryContactDisposition | string;
  label: string;
}

export interface DeliveryRunMonitorContact {
  total: number;
  confirmed: number;
  awaiting_reply: number;
  excluded_unconfirmed: number;
  unresolved: number;
  all_resolved: boolean;
}

export interface DeliveryRunMonitorLoad {
  total_items: number;
  verified: number;
  loaded: number;
  photographed: number;
  ready: number;
  all_ready: boolean;
  /** At least one full delivery on truck; no partial loads. */
  can_close_truck?: boolean;
}

export interface DeliveryRunMonitorRoute {
  revision: number;
  optimized: boolean;
  etas_available: boolean;
  provider_status: 'optimized' | 'fallback' | 'none' | string;
  last_optimized_at: string | null;
}

export interface DeliveryRunMonitor {
  contact: DeliveryRunMonitorContact;
  load: DeliveryRunMonitorLoad;
  truck_closed: boolean;
  truck_closed_at: string | null;
  departure_override: boolean;
  current_stop: DeliveryRunStop | null;
  next_stop: DeliveryRunStop | null;
  unconfirmed: DeliveryRunStop[];
  route: DeliveryRunMonitorRoute;
  pending_media: number;
  exceptions: DeliveryRunStop[];
}

export interface DeliveryTextTemplate {
  key: string;
  label: string;
  body: string;
}

export interface DeliveryAddressRevision {
  id: number;
  address: string;
  is_apt: boolean;
  unit: string;
  reason: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

export interface DeliveryLineItem {
  line_id: number | null;
  sku: string;
  description: string;
  quantity: number;
  scannable: boolean;
  scan_verified?: boolean;
}

export interface DeliveryRunStop {
  id: number;
  job_id: number;
  position: number;
  state: DeliveryRunStopState;
  customer_name: string;
  phone: string;
  original_address: string;
  address: string;
  is_apt: boolean;
  unit: string;
  items_delivered: string;
  item_count: number;
  line_items?: DeliveryLineItem[];
  scan_verified?: Array<{
    line_id?: number | null;
    sku?: string;
    description?: string;
    verified_at?: string;
    verified_by?: string;
  }>;
  scan_verified_count?: number;
  scannable_count?: number;
  notes: string;
  job_status: DeliveryJobStatus;
  loaded_at: string | null;
  secured_at: string | null;
  contact_present_at: string | null;
  delivered_at: string | null;
  eta_arrive_at: string | null;
  eta_window_end_at: string | null;
  drive_seconds_from_prev: number | null;
  completed_at: string | null;
  proof_override: boolean;
  proof_override_reason: string;
  hold_reason: string;
  has_proof_photo: boolean;
  has_signature: boolean;
  latest_call_result: DeliveryCallResult | null;
  latest_call_at: string | null;
  latest_call_note: string;
  contact_disposition?: DeliveryContactDisposition | string;
  contact_disposition_at?: string | null;
  excluded_unconfirmed?: boolean;
  excluded_unconfirmed_at?: string | null;
  excluded_unconfirmed_reason?: string;
  off_route?: boolean;
  off_route_reason?: string;
  is_confirmed: boolean;
  needs_call_again: boolean;
  has_call_result: boolean;
  stop_items?: DeliveryStopItem[];
  items_ready_count?: number;
  items_total_count?: number;
  returned_unloaded_at: string | null;
  returned_items_stored_at: string | null;
  return_issue_code: string;
  return_issue_notes: string;
  return_reconciled_at: string | null;
  rescheduled_at?: string | null;
  rescheduled_to_date?: string | null;
  call_attempts: DeliveryCallAttempt[];
  attachments: DeliveryAttachment[];
  address_revisions: DeliveryAddressRevision[];
  text_templates: DeliveryTextTemplate[];
}

export interface DeliveryRun {
  id: number;
  date: string;
  availability_id: number | null;
  status: DeliveryRunStatus;
  phase: DeliveryRunPhase;
  started_at: string | null;
  ended_at: string | null;
  started_by: string;
  elapsed_seconds: number;
  route_revision: number;
  last_optimized_at: string | null;
  maps_url: string;
  route_summary?: {
    optimized?: boolean;
    etas_available?: boolean;
    provider_status?: 'optimized' | 'fallback' | 'none' | 'matrix' | string;
    provider?: string | null;
    fallback_reason?: string | null;
    calculated_at?: string | null;
    departure_at?: string | null;
    service_seconds_per_stop?: number | null;
    total_service_seconds?: number | null;
    total_eta_seconds?: number | null;
    total_drive_seconds?: number | null;
    total_distance_meters?: number | null;
    return_drive_seconds?: number | null;
    return_distance_meters?: number | null;
    estimated_finish_at?: string | null;
    optimized_stop_ids?: number[];
    stop_count?: number;
    confirmed_count?: number;
  };
  day_id?: number | null;
  truck_closed_at?: string | null;
  truck_closed?: boolean;
  truck_reopened_at?: string | null;
  departure_override?: boolean;
  departure_override_reason?: string;
  all_stops_resolved?: boolean;
  contact_dispositions?: DeliveryContactDispositionOption[];
  monitor?: DeliveryRunMonitor;
  notes: string;
  returned_to_store_at: string | null;
  truck_photos: DeliveryAttachment[];
  truck_photo_count: number;
  truck_seal_photo_count?: number;
  max_truck_photos: number;
  all_loaded_secured: boolean;
  all_stops_called: boolean;
  can_finish: boolean;
  next_action?: string | null;
  allowed_actions?: string[];
  return_issue_codes: Array<{ value: DeliveryReturnIssueCode | string; label: string }>;
  progress: {
    total: number;
    confirmed?: number;
    completed: number;
    on_hold: number;
    queued: number;
    failed: number;
    needs_reconcile?: number;
    rescheduled?: number;
  };
  next_up: DeliveryRunStop | null;
  stops: DeliveryRunStop[];
  events?: DeliveryRunEvent[];
  service_minutes_per_stop: number;
}
