/**
 * Payment method choices
 */
/** payroll: payroll deduction, staff only (pos.staff_purchases). */
/** 'thrift': Thrift+ credit and/or ThriftBucks paid the whole sale (2026-10-21). */
export type PaymentMethod = 'cash' | 'card' | 'split' | 'payroll' | 'thrift';

export type CardType = '' | 'credit' | 'debit';

export interface CardPreview {
  enabled: boolean;
  percent: string;
  rate: string;
  card_base: string;
  no_surcharge: string;
  with_surcharge: string;
  surcharge_amount: string;
}

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
  /** Training register: practice sales only, nothing real written (2026-10-10). */
  is_training?: boolean;
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
  /** Since 2026-10-21 a handoff counts the bills only; what Dash expected, by bill. */
  bills_only?: boolean;
  expected_count?: Partial<Record<keyof DenominationBreakdown, number>>;
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
  /** Why it was dropped (2026-10-21: required). */
  reason?: string;
}

export interface Drawer {
  id: number;
  register: number;
  register_name: string;
  register_code: string;
  /** The drawer's register is the training register (2026-10-10). */
  register_is_training?: boolean;
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
  /** What should be in the drawer by bill and coin (2026-10-21): opening count + cash taken in - change - drops. */
  contents?: Partial<Record<keyof DenominationBreakdown, number>>;
  /** Blind counts (2026-10-21): the till fund expected at opening, the contents expected at close, the coin counter's
   * total when coins were not counted by coin, and the close note. */
  opening_expected?: Partial<Record<keyof DenominationBreakdown, number>> | null;
  closing_expected?: Partial<Record<keyof DenominationBreakdown, number>> | null;
  coin_counter_total?: string | null;
  close_note?: string;
  card_sales_total?: string;
  card_surcharge_total?: string;
  handoffs: DrawerHandoff[];
  drops: CashDrop[];
  movements?: CashMovement[];
  /** Someone covering the register now (2026-10-22), or null. */
  cover?: DrawerCoverInfo | null;
  /** Only on the answer to an open, handoff, takeover or close: the blind count beside what was expected. */
  count_check?: CountCheck;
}

/** Cover (2026-10-22): who stepped in, whose drawer it is, and when 10 idle minutes are up (a sale moves it). */
export interface DrawerCoverInfo {
  id: number;
  user: number;
  user_name: string;
  cashier: number;
  cashier_name: string;
  started_at: string;
  idle_ends_at: string;
}

/** Paid in / paid out (2026-10-21): money in or out of an open drawer for something other than a sale, with a reason. */
export interface CashMovement {
  id: number;
  drawer: number;
  kind: 'paid_in' | 'paid_out';
  amount: Partial<Record<keyof DenominationBreakdown, number>>;
  total: string;
  reason: string;
  performed_by: number;
  performed_by_name: string | null;
  created_at: string;
}

/** A blind count's answer: counted beside expected by bill and coin (coins as one row from the coin counter). */
export interface CountCheck {
  rows: { key: string; label: string; counted: number | string; expected: number | string; difference: number | string }[];
  counted_total: string;
  expected_total: string;
  difference_total: string;
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

export type CartLineKind = 'item' | 'manual' | 'discount' | 'delivery' | 'assembly';
export type SaleLabel = '' | 'labor_day' | 'summer';

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
  line_kind?: CartLineKind;
  meta?: Record<string, unknown>;
  sale_label?: SaleLabel | string;
  /** The sale's name as the customer sees it ("Labor Day 10%"); blank without a sale. */
  sale_display?: string;
  sale_percent?: string;
  list_total?: string;
  sale_savings?: string;
  /** Thrift+: the member rebate taken off this line (0 while Thrift+ is dark). */
  thrift_savings?: string;
  /** "No tax" (2026-10-21, pop): this line is not taxed; the rest of the sale is. */
  tax_exempt?: boolean;
  created_at: string;
}

export interface SaleMode {
  active: boolean;
  source: 'calendar' | 'override';
  start: string;
  end: string;
  percent: string;
  override: boolean | null;
  /** The store sale's name (owner setting, default "Labor Day"). */
  name: string;
  summer_percent: string;
  /** The sale cashiers mark line by line (was the always-on Summer 50% tile): off unless the owner turns it on. */
  line_sale: { on: boolean; name: string; percent: string };
  assembly_price: string;
}

export interface Receipt {
  id: number;
  cart: number;
  receipt_number: string;
  printed: boolean;
  emailed: boolean;
  created_at: string;
}

export interface CartSavingsLine {
  label: string;
  amount: string;
}

export interface CartSavings {
  total: string;
  lines: CartSavingsLine[];
}

export interface Cart {
  id: number;
  drawer: number;
  cashier: number | null;
  cashier_name: string | null;
  customer: number | null;
  /** 'training': a practice sale on the training register (nothing real written). */
  status: 'open' | 'completed' | 'voided' | 'training' | 'suspended';
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  payment_method: PaymentMethod;
  cash_tendered: string | null;
  change_given: string | null;
  /** By bill and coin (2026-10-21): what was handed over, and what Dash said to give back. */
  cash_received?: Partial<Record<keyof DenominationBreakdown, number>> | null;
  change_breakdown?: Partial<Record<keyof DenominationBreakdown, number>> | null;
  /** The cashier typed an amount: the bills in `cash_received` are Dash's guess. */
  cash_received_typed?: boolean;
  /** Only on the Complete answer: the drawer could not make the change exactly from what Dash knows is in it. */
  change_short?: boolean;
  card_amount: string | null;
  card_type?: CardType;
  card_surcharge_rate?: string;
  card_surcharge_amount?: string;
  card_charged_total?: string | null;
  card_type_fixed_at?: string | null;
  card_type_fixed_by?: number | null;
  card_type_fixed_by_name?: string | null;
  card_type_fix_deadline?: string | null;
  /** Payroll deduction: whose next paycheck this sale comes out of. */
  payroll_employee?: number | null;
  payroll_employee_name?: string | null;
  completed_at: string | null;
  /** When the sale was set aside (status 'suspended'); null otherwise. */
  suspended_at?: string | null;
  /** A void (2026-10-21): when, the manager whose PIN approved it, and why. */
  voided_at?: string | null;
  voided_by?: number | null;
  voided_by_name?: string | null;
  void_reason?: string;
  /** A tax-exempt sale to a non-profit (2026-10-21): the organization, its certificate number or photo, who, when. */
  tax_exempt_org?: string;
  tax_exempt_number?: string;
  tax_exempt_photo_url?: string | null;
  tax_exempt_by?: number | null;
  tax_exempt_by_name?: string | null;
  tax_exempt_at?: string | null;
  /** Sold while covering someone's drawer (2026-10-22): the cover, and whose drawer it was. */
  cover?: number | null;
  covering_for_name?: string | null;
  created_at: string;
  lines: CartLine[];
  receipt?: Receipt | null;
  savings?: CartSavings;
  /** Thrift+ credit spent on this sale: a payment after tax (0 while Thrift+ is dark). */
  thrift_credit?: string;
  /** Thrift+ member, ThriftBucks and Thrift+ credit; null while Thrift+ is dark at this register. */
  thrift_plus?: ThriftPlusCartBlock | null;
  /** Transactions list: the member and ThriftBucks on this sale; null for a guest. */
  thrift_row?: { member: string; earned: string; used: string; credit_used: string; instant: string } | null;
  /** add-item only: the scanned tag was sold or already on the sale, so the register rang the next unit of it. */
  unit_swapped?: { scanned_sku: string; added_sku: string };
}

/** One sale set aside at the register (Suspend, owner 2026-10-20): a bookmark tab. */
export interface SuspendedSaleTab {
  id: number;
  /** The Thrift+ member's first name; '' for a guest sale. */
  member_first_name: string;
  item_count: number;
  total: string;
  suspended_at: string | null;
  cashier_name: string;
}

/** A receipt line's 3-day returns mark (W10, A3), frozen on the line at the sale. */
export type ThriftPlusLineMark = '3-day return' | 'AS IS';

/**
 * Thrift+ at the register (10-14 register build, the 10-12 policy); from
 * apps/thriftplus/services/register.py cart_block. Contract: workspace/register-contract.md.
 * ThriftBucks amounts are numbers next to the word (never "$"); instant_off and credit are dollars.
 */
export interface ThriftPlusCartBlock {
  live: boolean;
  member: {
    account_id: number;
    person_id: number;
    name: string;
    /** The receipt prints the first name only (owner 2026-10-14). Older servers: take it from ``name``. */
    first_name?: string;
    role: 'primary' | 'secondary';
    photo_url: string | null;
    verified_18: boolean;
    /** The member code's last 4. Never shown or printed: there is no Thrift+ card (owner 2026-10-14). */
    card_last4: string;
    practice: boolean;
    /** 'bank' = Kept (the Default); 'instant' = redeemed instantly at the instant share. */
    choice: 'bank' | 'instant';
    rering: boolean;
    /** pending (joined online, not finished), member or off (owner 2026-10-20). Older servers leave it out. */
    standing?: 'pending' | 'member' | 'off';
    /**
     * False: found by name or phone and not yet confirmed at the register, so kept ThriftBucks wait for the
     * "Member is here" tap (owner 2026-10-21). A scanned QR is here at once. Older servers leave it out.
     */
    here?: boolean;
  } | null;
  /** False when Thrift+ credit and kept ThriftBucks leave nothing, or no member. */
  instant_offered: boolean;
  /** Why instant redemption is not offered ('' when it is). */
  instant_reason: string;
  /** "0.50" */
  instant_share: string;
  /** ThriftBucks this trip collects (full value), "35.00". */
  collected: string;
  /** ISO date: today's collected ThriftBucks are usable through this day (sale day + 30). */
  use_by: string | null;
  /** When choice=instant: the ThriftBucks redeemed; else "0.00". */
  instant_bucks: string;
  /** When choice=instant: dollars off today (the share, rounded up); else "0.00". */
  instant_off: string;
  /** Dollars off today if they choose instant: the server's figure, capped at what is left to pay. */
  instant_offer?: string;
  /** True unless the cashier tapped "Don't use ThriftBucks today". */
  bucks_auto: boolean;
  /** Kept ThriftBucks usable today (collected before today, not past use-by). */
  bucks_available: string;
  /** Kept ThriftBucks applied this trip (one pre-tax discount line, owned by the sync). */
  bucks_used: string;
  /** Thrift+ credit balance. */
  credit_available: string;
  /** Thrift+ credit applied (a payment after tax). */
  credit_used: string;
  /** The member's balances now (before this sale). */
  balances: { bucks: string; bucks_use_by: string | null; credit: string };
  /** Guests: "This trip would have collected 35.00 ThriftBucks." */
  guest_line: string;
  /** Closed days in this sale's 3-day return window: say it to the member (owner 2026-10-20). '' when none. */
  return_note?: string;
  /** ISO date: the last day this sale's 3-day returns are taken (sale day + 3). Only for a member with a 3-day-return line. */
  returns_until?: string | null;
  /** Keyed by cart line id. */
  /** Per line: ThriftBucks, savings and the mark; a non-member's line also says what it would be for a member. */
  lines: Record<string, { reward: string; savings: string; mark: ThriftPlusLineMark; join_mark?: ThriftPlusLineMark }>;
  /** The cart's ThriftBucks discount line (no edit or delete at the register). */
  bucks_line_id: number | null;
  restricted_line_ids: number[];
  /** Member lines of $100+ still without a serial and condition photo. */
  photo_line_ids?: number[];
  /** total - credit_used */
  amount_due: string;
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
  card_surcharge_total?: string;
  /** Thrift+ 3-day returns taken on this day (negative). `revenue` is already net of them. */
  returns?: string;
  /** Thrift+ revenue on this day: ThriftBucks not given on instant redemptions, and ThriftBucks that expired. */
  thriftplus_revenue?: string;
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
  week_returns?: string;
  week_thriftplus_revenue?: string;
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
  /** Today's Thrift+ returns (negative) and Thrift+ revenue; `today` is net item sales. */
  today_returns?: string;
  today_thriftplus_revenue?: string;
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
  /** This week's letter: the daily average and the cross-checks combined. */
  average_grade: string | null;
  /** Letter for the most recent graded day. */
  last_grade: string | null;
  /** Slug of the form that feeds the dashboard (for deep links). */
  form_slug?: string | null;
  /** Weekly recurring QA schedule. Monday=0 ... Sunday=6. */
  schedule: RetailQaGoalSchedule;
  grade_goal: string | null;
  week_audits: number;
  today_work_cycles: number;
  week_work_cycles: number;
  week_idle_dismissed: number;
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
  /** The day's Retail QA score behind the letter, 0-100. */
  retail_score?: number | null;
  /** Daily effective weights after excluded thirds drop out. */
  retail_weights?: { spot?: number; do?: number; cross?: number } | null;
  retail_excluded?: string[] | null;
  retail_count?: number;
  retail_required?: number;
  retail_scheduled?: boolean;
  retail_grade_met?: boolean;
  retail_goal_met?: boolean;
  /** Submitted QA audit ids for this day (Retail card deep links). */
  retail_audit_ids?: number[];
  /** Store-open flag from hours / week_grade. */
  open?: boolean;
  /** True when section checks, Open/Day/Close, or a walk can count. */
  graded?: boolean;
  expected?: {
    section_checks: boolean;
    open_day_close: boolean;
    walk_possible: boolean;
  };
  is_future: boolean;
}

export interface DepartmentDailyWeek {
  label: string;
  /** True for the Mon-Sun week containing today. */
  is_current?: boolean;
  week_start: string;
  week_end: string;
  /**
   * The week's Retail QA letter: Spot, Do, and Cross combined at the
   * effective weights for this week.
   */
  retail_week_grade?: string | null;
  retail_week_score?: number | null;
  retail_weights?: { spot?: number; do?: number; cross?: number } | null;
  retail_excluded?: string[] | null;
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
  audits_per_day?: number;
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

export type FocusDepartment = 'retail' | 'processing' | 'restoration' | 'buying';

/** One department's focus number on the staff Dashboard (2026-10-21; owner setting dashboard.focus_numbers). */
export interface FocusNumber {
  department: FocusDepartment;
  metric: string;
  label: string;
  kind: 'count' | 'money' | 'percent';
  value: string | null;
  /** E.g. "same day last week" or "target 40-50%". */
  compare_label: string;
  compare_value: string | null;
}

export interface DashboardMetrics {
  sales: SalesMetrics;
  focus: FocusNumber[];
  department_metrics: DepartmentMetrics;
}

export interface DashboardAlert {
  type: 'time_entries' | 'drawers';
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

/** One append-only audit row from `DeliveryChangeEvent`. */
export interface DeliveryChangeEvent {
  id: number;
  entity_type: 'day' | 'job' | 'item';
  entity_id: number;
  day_id: number | null;
  job_id: number | null;
  action: string;
  /** Server-rendered human line, e.g. `Delivery updated · notes, phone`. */
  summary: string;
  reason: string;
  changed_fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actor_id: number | null;
  actor_name: string;
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
